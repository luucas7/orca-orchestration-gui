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
    emptyReason: null
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
})
