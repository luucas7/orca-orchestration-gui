// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  flush,
  mountShell
} from '../../../shared/plugins/frames/plugin-frame-shell-mount.test-fixture'
import type { ScopedOrchestrationGraph } from '../../../shared/plugins/workers/plugin-host-api-orchestration'

const panelHtmlPath = join(
  process.cwd(),
  'resources',
  'plugins',
  'launch',
  'stablyai.orca-orchestration-view',
  'panel',
  'index.html'
)

function requireElement<T extends Element>(
  parent: ParentNode,
  selector: string,
  ctor: new () => T
): T {
  const el = parent.querySelector(selector)
  if (!(el instanceof ctor)) {
    throw new Error(`Expected element "${selector}" to be ${ctor.name}`)
  }
  return el
}

function requireElementById<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const el = document.getElementById(id)
  if (!(el instanceof ctor)) {
    throw new Error(`Expected element "#${id}" to be ${ctor.name}`)
  }
  return el
}

describe('orchestration view panel (headless rendered check)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    sessionStorage.clear()
    document.body.innerHTML = ''
  })

  function loadPanel() {
    const shell = mountShell('panel')
    const html = readFileSync(panelHtmlPath, 'utf8')

    // Extract body inner HTML and script
    const bodyContent = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
    const bodyWithoutScript = bodyContent.replace(/<script[\s\S]*?<\/script>/, '')
    const scriptContent = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

    document.body.innerHTML = bodyWithoutScript

    // Execute panel script
    window.eval(scriptContent)

    return shell
  }

  const sampleGraph: ScopedOrchestrationGraph = {
    activeRootRunId: 'run-root-1',
    selectedRootRunId: 'run-root-1',
    roots: [
      {
        runId: 'run-root-1',
        objective: 'Lead orchestrator run',
        coordinatorHandle: 'term-lead',
        coordinatorOrcaSessionId: 'sess-lead-1',
        createdAt: '2026-11-04T07:00:00Z',
        status: 'running'
      },
      {
        runId: 'run-root-2',
        objective: 'Secondary orchestrator run',
        coordinatorHandle: null,
        coordinatorOrcaSessionId: null,
        createdAt: '2026-11-04T06:00:00Z',
        status: 'completed'
      }
    ],
    nodes: [
      {
        id: 'node-root',
        name: 'Lead Orchestrator',
        cli: 'claude',
        role: 'root-orchestrator',
        shortTaskTitle: 'Coordinate sub-agents',
        state: 'running',
        taskId: 'task-root',
        dispatchId: null,
        terminalHandle: 'term-lead',
        orcaSessionId: 'sess-lead-1',
        parentId: null,
        depth: 0
      },
      {
        id: 'node-child-1',
        name: 'Backend Sub-Orchestrator',
        cli: 'codex',
        role: 'orchestrator',
        shortTaskTitle: 'Design schemas and endpoints',
        state: 'running',
        taskId: 'task-child-1',
        dispatchId: 'disp-child-1',
        terminalHandle: 'term-child-1',
        orcaSessionId: 'sess-child-1',
        parentId: 'node-root',
        depth: 1
      },
      {
        id: 'node-worker-1',
        name: 'DB Worker',
        cli: 'opencode',
        role: 'worker',
        shortTaskTitle: 'Run migrations',
        state: 'completed',
        taskId: 'task-worker-1',
        dispatchId: 'disp-worker-1',
        terminalHandle: 'term-worker-1',
        orcaSessionId: null,
        parentId: 'node-child-1',
        depth: 2
      }
    ],
    edges: [
      { from: 'node-root', to: 'node-child-1' },
      { from: 'node-child-1', to: 'node-worker-1' }
    ],
    emptyReason: null,
    attentionItems: [],
    attentionCount: 0,
    sourceFreshness: {
      status: 'live',
      lastUpdatedAt: '2026-11-04T07:00:00Z',
      provenance: 'orca.runtime.db',
      isVerified: true
    }
  }

  it('fetches scoped graph on load, renders DAG hierarchy, badges and identities', async () => {
    const { fromHost, posted } = loadPanel()

    // First message after ready is req 0: orchestration.getScopedGraph
    const reqs = posted().filter((m) => m.kind === 'req')
    expect(reqs.length).toBeGreaterThanOrEqual(1)
    const initialReq = reqs[0]
    expect(initialReq.method).toBe('orchestration.getScopedGraph')

    // Answer with sample graph
    fromHost({
      orca: 1,
      kind: 'res',
      id: initialReq.id,
      result: sampleGraph
    })
    await flush()

    // Verify root selector populated
    const select = requireElementById('root-select', HTMLSelectElement)
    expect(select.children.length).toBe(2)
    expect(select.value).toBe('run-root-1')

    // Verify nodes rendered
    const nodeContainer = document.getElementById('node-container')!
    const cards = nodeContainer.querySelectorAll('.node-card')
    expect(cards.length).toBe(3)

    // Verify root node badges & labels
    const rootCard = document.getElementById('node-node-root')!
    expect(rootCard.textContent).toContain('Root')
    expect(rootCard.textContent).toContain('claude')
    expect(rootCard.textContent).toContain('running')
    expect(rootCard.textContent).toContain('Lead Orchestrator')
    expect(rootCard.textContent).toContain('Coordinate sub-agents')
    expect(rootCard.textContent).toContain('Task:task-root')
    expect(rootCard.textContent).toContain('Terminal:term-lead')
    expect(rootCard.textContent).toContain('Session:sess-lead-1')

    // Verify worker node with opencode CLI
    const workerCard = document.getElementById('node-node-worker-1')!
    expect(workerCard.textContent).toContain('Worker')
    expect(workerCard.textContent).toContain('opencode')
    expect(workerCard.textContent).toContain('completed')
    expect(workerCard.textContent).toContain('DB Worker')
    expect(workerCard.textContent).toContain('Run migrations')
    expect(workerCard.textContent).toContain('Dispatch:disp-worker-1')
  })

  it('supports selecting a different root and re-fetching graph', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({ orca: 1, kind: 'res', id: req0.id, result: sampleGraph })
    await flush()

    const select = requireElementById('root-select', HTMLSelectElement)
    select.value = 'run-root-2'
    select.dispatchEvent(new Event('change'))
    await flush()

    const req1 = posted().findLast(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    expect(req1.params).toEqual({ rootRunId: 'run-root-2' })
  })

  it('navigates to exact terminal on button click without creating duplicate PTY', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({ orca: 1, kind: 'res', id: req0.id, result: sampleGraph })
    await flush()

    const workerCard = document.getElementById('node-node-worker-1')!
    const btnNav = requireElement(workerCard, '.btn-terminal', HTMLButtonElement)
    expect(btnNav.getAttribute('data-terminal')).toBe('term-worker-1')

    btnNav.click()
    await flush()

    const navReq = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.navigateTerminal'
    )!
    expect(navReq).toBeDefined()
    expect(navReq.params).toEqual({ terminalHandle: 'term-worker-1' })

    // Simulate successful navigation
    fromHost({
      orca: 1,
      kind: 'res',
      id: navReq.id,
      result: { navigated: true, tabId: 'tab-1', worktreeId: 'worktree-1' }
    })
    await flush()

    const alertBanner = document.getElementById('alert-banner')!
    expect(alertBanner.classList.contains('active')).toBe(false)
  })

  it('displays alert banner when terminal is unknown or has exited', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({ orca: 1, kind: 'res', id: req0.id, result: sampleGraph })
    await flush()

    const workerCard = document.getElementById('node-node-worker-1')!
    const btnNav = requireElement(workerCard, '.btn-terminal', HTMLButtonElement)
    btnNav.click()
    await flush()

    const navReq = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.navigateTerminal'
    )!

    // Simulate host rejection (terminal_exited)
    fromHost({
      orca: 1,
      kind: 'res',
      id: navReq.id,
      error: { code: 'terminal_exited', message: 'terminal session has exited' }
    })
    await flush()

    const alertBanner = document.getElementById('alert-banner')!
    expect(alertBanner.classList.contains('active')).toBe(true)
    expect(document.getElementById('alert-message')!.textContent).toContain(
      'terminal session has exited'
    )
  })

  it('folds and unfolds child groups on fold button click', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({ orca: 1, kind: 'res', id: req0.id, result: sampleGraph })
    await flush()

    // Root node has 1 child
    const rootCard = document.getElementById('node-node-root')!
    const btnFold = requireElement(rootCard, '.btn-fold', HTMLButtonElement)
    expect(btnFold.textContent).toContain('Collapse')

    // Click to fold
    btnFold.click()
    await flush()

    // Children are now folded and hidden
    expect(document.getElementById('node-node-child-1')).toBeNull()
    expect(document.getElementById('node-node-worker-1')).toBeNull()

    const updatedRootCard = document.getElementById('node-node-root')!
    const updatedBtnFold = requireElement(updatedRootCard, '.btn-fold', HTMLButtonElement)
    expect(updatedBtnFold.textContent).toContain('Expand')

    // Click to unfold
    updatedBtnFold.click()
    await flush()

    // Children are visible again
    expect(document.getElementById('node-node-child-1')).not.toBeNull()
    expect(document.getElementById('node-node-worker-1')).not.toBeNull()
  })

  it('shows empty state overlay when emptyReason is no-runs', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({
      orca: 1,
      kind: 'res',
      id: req0.id,
      result: {
        activeRootRunId: null,
        selectedRootRunId: null,
        roots: [],
        nodes: [],
        edges: [],
        emptyReason: 'no-runs'
      }
    })
    await flush()

    const emptyState = document.getElementById('empty-state')!
    expect(emptyState.classList.contains('active')).toBe(true)
    expect(document.getElementById('empty-state-message')!.textContent).toContain(
      'No active orchestration runs'
    )
  })

  it('shows distinct empty state when emptyReason is run-not-found', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({
      orca: 1,
      kind: 'res',
      id: req0.id,
      result: {
        activeRootRunId: null,
        selectedRootRunId: 'unknown-run',
        roots: [],
        nodes: [],
        edges: [],
        emptyReason: 'run-not-found'
      }
    })
    await flush()

    const emptyState = document.getElementById('empty-state')!
    expect(emptyState.classList.contains('active')).toBe(true)
    expect(emptyState.querySelector('.overlay-title')!.textContent).toBe(
      'Orchestration Run Not Found'
    )
    expect(document.getElementById('empty-state-message')!.textContent).toContain('unknown target')
  })

  it('shows distinct disabled state when emptyReason is disabled', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({
      orca: 1,
      kind: 'res',
      id: req0.id,
      result: {
        activeRootRunId: null,
        selectedRootRunId: null,
        roots: [],
        nodes: [],
        edges: [],
        emptyReason: 'disabled'
      }
    })
    await flush()

    const disabledState = document.getElementById('disabled-state')!
    expect(disabledState.classList.contains('active')).toBe(true)
    expect(disabledState.querySelector('.overlay-title')!.textContent).toBe(
      'Orchestration View Disabled'
    )
    expect(document.getElementById('disabled-state-message')!.textContent).toContain(
      'currently disabled in your workspace settings'
    )
  })

  it('preserves camera pan and zoom across graph refreshes without jumping', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({ orca: 1, kind: 'res', id: req0.id, result: sampleGraph })
    await flush()

    // Zoom in via button
    const btnZoomIn = requireElementById('btn-zoom-in', HTMLButtonElement)
    btnZoomIn.click()

    const canvas = document.getElementById('canvas')!
    const transformBefore = canvas.style.transform

    // Click Refresh
    const btnRefresh = requireElementById('btn-refresh', HTMLButtonElement)
    btnRefresh.click()
    await flush()

    const req1 = posted().findLast(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!
    fromHost({ orca: 1, kind: 'res', id: req1.id, result: sampleGraph })
    await flush()

    // Camera transform must be preserved exactly
    expect(canvas.style.transform).toBe(transformBefore)
  })

  it('demonstration: 20-agent hierarchy renders with attention counter covering off-screen nodes', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!

    // Build 22-agent hierarchy: 1 root, 3 sub-orchestrators, 18 workers
    const nodes: ScopedOrchestrationGraph['nodes'] = [
      {
        id: 'node-root',
        name: 'Lead Orchestrator',
        cli: 'claude',
        role: 'root-orchestrator',
        shortTaskTitle: 'Coordinate sub-agents',
        state: 'running',
        taskId: 'task-root',
        dispatchId: null,
        terminalHandle: 'term-lead',
        orcaSessionId: 'sess-lead-1',
        parentId: null,
        depth: 0
      }
    ]
    const edges: ScopedOrchestrationGraph['edges'] = []

    for (let c = 1; c <= 3; c++) {
      const coordId = `node-coord-${c}`
      nodes.push({
        id: coordId,
        name: `Sub-Coordinator ${c}`,
        cli: 'claude',
        role: 'orchestrator',
        shortTaskTitle: `Coordinate branch ${c}`,
        state: 'running',
        taskId: `task-coord-${c}`,
        dispatchId: `disp-coord-${c}`,
        terminalHandle: `term-coord-${c}`,
        orcaSessionId: `sess-coord-${c}`,
        parentId: 'node-root',
        depth: 1
      })
      edges.push({ from: 'node-root', to: coordId })

      for (let w = 1; w <= 6; w++) {
        const workerNum = (c - 1) * 6 + w
        const workerId = `node-worker-${workerNum}`
        const isQuotaFailure = workerNum === 17
        nodes.push({
          id: workerId,
          name: `Worker ${workerNum}`,
          cli: 'codex',
          role: 'worker',
          shortTaskTitle: isQuotaFailure ? 'Failed on quota limit' : `Process batch ${workerNum}`,
          state: isQuotaFailure ? 'failed' : 'running',
          taskId: `task-worker-${workerNum}`,
          dispatchId: `disp-worker-${workerNum}`,
          terminalHandle: `term-worker-${workerNum}`,
          orcaSessionId: null,
          parentId: coordId,
          depth: 2,
          attention: isQuotaFailure
            ? {
                id: `att-${workerId}`,
                nodeId: workerId,
                category: 'confirmed-failure',
                cause: 'quota-exceeded',
                reason: 'Quota exceeded (429: Resource exhausted)',
                isHeuristic: false,
                source: 'orca.runtime.db'
              }
            : undefined
        })
        edges.push({ from: coordId, to: workerId })
      }
    }

    const largeHierarchyGraph: ScopedOrchestrationGraph = {
      activeRootRunId: 'run-root-1',
      selectedRootRunId: 'run-root-1',
      roots: sampleGraph.roots,
      nodes,
      edges,
      emptyReason: null,
      attentionItems: [
        {
          id: 'att-node-worker-17',
          nodeId: 'node-worker-17',
          category: 'confirmed-failure',
          cause: 'quota-exceeded',
          reason: 'Quota exceeded (429: Resource exhausted)',
          isHeuristic: false,
          source: 'orca.runtime.db'
        }
      ],
      attentionCount: 1,
      sourceFreshness: {
        status: 'live',
        lastUpdatedAt: '2026-11-04T07:00:00Z',
        provenance: 'orca.runtime.db',
        isVerified: true
      }
    }

    fromHost({ orca: 1, kind: 'res', id: req0.id, result: largeHierarchyGraph })
    await flush()

    // 22 node cards rendered in graph container
    const cards = document.querySelectorAll('.node-card')
    expect(cards.length).toBe(22)

    // Attention badge shows count 1
    const countBadge = requireElementById('attention-count-badge', HTMLSpanElement)
    expect(countBadge.textContent).toBe('1')
    expect(countBadge.style.display).not.toBe('none')

    // Off-screen worker-17 card rendered with attention highlight
    const worker17Card = document.getElementById('node-node-worker-17')!
    expect(worker17Card).toBeDefined()
    expect(worker17Card.classList.contains('has-attention')).toBe(true)
    expect(worker17Card.classList.contains('attention-confirmed-failure')).toBe(true)

    const attRow = worker17Card.querySelector('.node-attention-row.confirmed-failure')!
    expect(attRow).toBeDefined()
    expect(attRow.textContent).toContain('Quota exceeded (429: Resource exhausted)')
  })

  it('attention drawer distinguishes confirmed-failure, expected-intervention, and uncertain with visible reasons and provenance', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!

    const graphWithAttention: ScopedOrchestrationGraph = {
      ...sampleGraph,
      nodes: [
        {
          ...sampleGraph.nodes[0],
          attention: {
            id: 'att-node-root',
            nodeId: 'node-root',
            category: 'expected-intervention',
            cause: 'input-required',
            reason: 'Waiting for user intervention: plan confirmation',
            isHeuristic: false,
            source: 'orca.runtime.db'
          }
        },
        {
          ...sampleGraph.nodes[1],
          attention: {
            id: 'att-node-child-1',
            nodeId: 'node-child-1',
            category: 'confirmed-failure',
            cause: 'quota-exceeded',
            reason: 'Quota exceeded (429: Resource exhausted)',
            isHeuristic: false,
            source: 'orca.runtime.db'
          }
        },
        {
          ...sampleGraph.nodes[2],
          attention: {
            id: 'att-node-worker-1',
            nodeId: 'node-worker-1',
            category: 'uncertain',
            cause: 'unconfirmed-heuristic',
            reason: 'Watcher heuristic observation: agent process exited unannounced',
            isHeuristic: true,
            source: 'watcher.heuristic'
          }
        }
      ],
      attentionItems: [
        {
          id: 'att-node-child-1',
          nodeId: 'node-child-1',
          category: 'confirmed-failure',
          cause: 'quota-exceeded',
          reason: 'Quota exceeded (429: Resource exhausted)',
          isHeuristic: false,
          source: 'orca.runtime.db'
        },
        {
          id: 'att-node-root',
          nodeId: 'node-root',
          category: 'expected-intervention',
          cause: 'input-required',
          reason: 'Waiting for user intervention: plan confirmation',
          isHeuristic: false,
          source: 'orca.runtime.db'
        },
        {
          id: 'att-node-worker-1',
          nodeId: 'node-worker-1',
          category: 'uncertain',
          cause: 'unconfirmed-heuristic',
          reason: 'Watcher heuristic observation: agent process exited unannounced',
          isHeuristic: true,
          source: 'watcher.heuristic'
        }
      ],
      attentionCount: 3
    }

    fromHost({ orca: 1, kind: 'res', id: req0.id, result: graphWithAttention })
    await flush()

    // Counter badge shows 3
    const badge = requireElementById('attention-count-badge', HTMLSpanElement)
    expect(badge.textContent).toBe('3')

    // Open attention panel
    const btnAttention = requireElementById('btn-attention', HTMLButtonElement)
    btnAttention.click()

    const attentionPanel = requireElementById('attention-panel', HTMLElement)
    expect(attentionPanel.style.display).toBe('flex')

    const items = attentionPanel.querySelectorAll('.attention-item-card')
    expect(items.length).toBe(3)

    // Item 1: confirmed-failure with quota cause
    const item1 = items[0]
    expect(item1.classList.contains('confirmed-failure')).toBe(true)
    expect(item1.querySelector('.attention-category-badge')!.textContent).toBe('Confirmed Failure')
    expect(item1.querySelector('.attention-cause-badge')!.textContent).toBe('quota-exceeded')
    expect(item1.querySelector('.attention-item-reason')!.textContent).toBe(
      'Quota exceeded (429: Resource exhausted)'
    )
    expect(item1.querySelector('.attention-item-source')!.textContent).toContain('orca.runtime.db')

    // Item 2: expected-intervention
    const item2 = items[1]
    expect(item2.classList.contains('expected-intervention')).toBe(true)
    expect(item2.querySelector('.attention-category-badge')!.textContent).toBe(
      'Expected Intervention'
    )
    expect(item2.querySelector('.attention-cause-badge')!.textContent).toBe('input-required')
    expect(item2.querySelector('.attention-item-reason')!.textContent).toContain(
      'Waiting for user intervention'
    )

    // Item 3: uncertain heuristic observation
    const item3 = items[2]
    expect(item3.classList.contains('uncertain')).toBe(true)
    expect(item3.querySelector('.heuristic-tag')!.textContent).toBe('HEURISTIC')
    expect(item3.querySelector('.attention-category-badge')!.textContent).toContain('Uncertain')
    expect(item3.querySelector('.attention-item-reason')!.textContent).toContain(
      'Watcher heuristic observation'
    )
    expect(item3.querySelector('.attention-item-source')!.textContent).toContain(
      'watcher.heuristic'
    )
  })

  it('camera centers on node only on user demand when clicking attention list item', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!

    const graphWithAttention: ScopedOrchestrationGraph = {
      ...sampleGraph,
      attentionItems: [
        {
          id: 'att-node-child-1',
          nodeId: 'node-child-1',
          category: 'confirmed-failure',
          cause: 'context-window-exhausted',
          reason: 'Context window exceeded',
          isHeuristic: false,
          source: 'orca.runtime.db'
        }
      ],
      attentionCount: 1
    }

    fromHost({ orca: 1, kind: 'res', id: req0.id, result: graphWithAttention })
    await flush()

    const canvas = document.getElementById('canvas')!
    const initialTransform = canvas.style.transform

    // Open attention panel
    const btnAttention = requireElementById('btn-attention', HTMLButtonElement)
    btnAttention.click()

    const item = requireElement(document, '.attention-item-card', HTMLDivElement)

    // Camera has NOT moved before clicking the attention item
    expect(canvas.style.transform).toBe(initialTransform)

    // Click attention item -> centers on node
    item.click()

    expect(canvas.style.transform).not.toBe(initialTransform)
    const childCard = document.getElementById('node-node-child-1')!
    expect(childCard.classList.contains('selected')).toBe(true)
  })

  it('stale or disconnected source preserves snapshot and disables navigation controls', async () => {
    const { fromHost, posted } = loadPanel()
    const req0 = posted().find(
      (m) => m.kind === 'req' && m.method === 'orchestration.getScopedGraph'
    )!

    const staleGraph: ScopedOrchestrationGraph = {
      ...sampleGraph,
      sourceFreshness: {
        status: 'disconnected',
        lastUpdatedAt: '2026-11-04T07:00:00Z',
        provenance: 'orca.runtime.db',
        isVerified: false
      }
    }

    fromHost({ orca: 1, kind: 'res', id: req0.id, result: staleGraph })
    await flush()

    // Stale banner is visible
    const staleBanner = requireElementById('stale-banner', HTMLElement)
    expect(staleBanner.style.display).toBe('flex')

    // Snapshot nodes remain rendered
    const cards = document.querySelectorAll('.node-card')
    expect(cards.length).toBe(3)

    // Terminal button is disabled
    const termBtns = document.querySelectorAll<HTMLButtonElement>('.btn-terminal')
    expect(termBtns.length).toBeGreaterThan(0)
    termBtns.forEach((btn) => {
      expect(btn.hasAttribute('disabled')).toBe(true)
      expect(btn.classList.contains('stale-disabled')).toBe(true)
    })

    // Attempting to click disabled terminal button does not send navigateTerminal request
    const initialCallCount = posted().filter(
      (m) => m.kind === 'req' && m.method === 'orchestration.navigateTerminal'
    ).length

    termBtns[0].click()
    await flush()

    const afterCallCount = posted().filter(
      (m) => m.kind === 'req' && m.method === 'orchestration.navigateTerminal'
    ).length
    expect(afterCallCount).toBe(initialCallCount)
  })
})
