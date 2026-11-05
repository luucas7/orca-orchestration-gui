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

describe('orchestration view panel - surveillance and watcher rendering', () => {
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
    const bodyContent = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? ''
    const bodyWithoutScript = bodyContent.replace(/<script[\s\S]*?<\/script>/, '')
    const scriptContent = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

    document.body.innerHTML = bodyWithoutScript
    window.eval(scriptContent)
    return shell
  }

  const surveillanceGraph: ScopedOrchestrationGraph = {
    activeRootRunId: 'run-root-alpha',
    selectedRootRunId: 'run-root-alpha',
    roots: [
      {
        runId: 'run-root-alpha',
        objective: 'Alpha Orchestration Run',
        coordinatorHandle: 'term-lead',
        coordinatorOrcaSessionId: 'sess-lead',
        createdAt: '2026-11-04T07:00:00Z',
        status: 'running'
      }
    ],
    nodes: [
      {
        id: 'root:run-root-alpha',
        name: 'Lead Orchestrator',
        cli: 'claude',
        role: 'root-orchestrator',
        shortTaskTitle: 'Coordinate sub-agents',
        state: 'running',
        taskId: null,
        dispatchId: null,
        terminalHandle: 'term-lead',
        orcaSessionId: 'sess-lead',
        parentId: null,
        depth: 0
      },
      {
        id: 'node:worker-1',
        name: 'Worker Agent 1',
        cli: 'codex',
        role: 'worker',
        shortTaskTitle: 'Implement task 1',
        state: 'working',
        taskId: 'task-1',
        dispatchId: 'disp-1',
        terminalHandle: 'term-w1',
        orcaSessionId: 'sess-w1',
        parentId: 'root:run-root-alpha',
        depth: 1
      },
      {
        id: 'node:watcher-sentinel',
        name: 'External Watcher Codex',
        cli: 'codex',
        role: 'watcher',
        shortTaskTitle: 'Observing Worker Agent 1',
        state: 'idle',
        taskId: null,
        dispatchId: null,
        terminalHandle: 'term-watch-codex',
        orcaSessionId: 'sess-watch-codex',
        parentId: null,
        depth: 1
      },
      {
        id: 'node:watcher-unbound',
        name: 'Unbound Watcher Heuristic',
        cli: 'opencode',
        role: 'watcher',
        shortTaskTitle: 'Observing Lead Orchestrator',
        state: 'idle',
        taskId: null,
        dispatchId: null,
        terminalHandle: null,
        orcaSessionId: null,
        parentId: null,
        depth: 0
      }
    ],
    edges: [
      {
        from: 'root:run-root-alpha',
        to: 'node:worker-1',
        linkType: 'delegation'
      },
      {
        from: 'node:watcher-sentinel',
        to: 'node:worker-1',
        linkType: 'surveillance'
      },
      {
        from: 'node:watcher-unbound',
        to: 'root:run-root-alpha',
        linkType: 'surveillance'
      }
    ],
    emptyReason: null,
    attentionItems: [],
    attentionCount: 0
  }

  it('renders Watcher nodes with distinct badge, styling, and navigation controls', async () => {
    const { fromHost, posted } = loadPanel()
    const initialReq = posted().find((m) => m.kind === 'req')
    expect(initialReq).toBeDefined()
    if (!initialReq) {
      return
    }
    expect(initialReq.method).toBe('orchestration.getScopedGraph')

    fromHost({
      orca: 1,
      kind: 'res',
      id: initialReq.id,
      result: surveillanceGraph
    })
    await flush()

    // 1. Verify Watcher card rendering
    const watcherCard = requireElement(document, '#node-node\\:watcher-sentinel', HTMLDivElement)
    expect(watcherCard.classList.contains('role-watcher')).toBe(true)

    // Role badge should display Watcher with .watcher class
    const roleBadge = requireElement(watcherCard, '.badge-role', HTMLSpanElement)
    expect(roleBadge.textContent).toBe('Watcher')
    expect(roleBadge.classList.contains('watcher')).toBe(true)

    // Verified Watcher with terminalHandle has 'Open Terminal' button
    const termBtn = watcherCard.querySelector('.btn-terminal')
    expect(termBtn).not.toBeNull()
    expect(termBtn?.textContent).toBe('Open Terminal')

    // Unbound Watcher with no terminalHandle has no navigation button
    const unboundCard = requireElement(document, '#node-node\\:watcher-unbound', HTMLDivElement)
    expect(unboundCard.querySelector('.btn-terminal')).toBeNull()
  })

  it('renders Surveillance edges with dashed styling and distinct attributes', async () => {
    const { fromHost, posted } = loadPanel()
    const initialReq = posted().find((m) => m.kind === 'req')
    expect(initialReq).toBeDefined()
    if (!initialReq) {
      return
    }

    fromHost({
      orca: 1,
      kind: 'res',
      id: initialReq.id,
      result: surveillanceGraph
    })
    await flush()

    // 1. Verify delegation edge
    const delegationPath = requireElement(document, 'path.edge-path.delegation', SVGPathElement)
    expect(delegationPath.getAttribute('data-link-type')).toBe('delegation')
    expect(delegationPath.getAttribute('data-from')).toBe('root:run-root-alpha')
    expect(delegationPath.getAttribute('data-to')).toBe('node:worker-1')

    // 2. Verify surveillance edge
    const surveillancePaths = document.querySelectorAll('path.edge-path.surveillance')
    expect(surveillancePaths.length).toBe(2)

    const firstSurv = surveillancePaths[0]
    expect(firstSurv.getAttribute('data-link-type')).toBe('surveillance')
    expect(firstSurv.getAttribute('data-from')).toBe('node:watcher-sentinel')
    expect(firstSurv.getAttribute('data-to')).toBe('node:worker-1')
    expect(firstSurv.getAttribute('aria-label')).toContain(
      'Surveillance: External Watcher Codex monitors Worker Agent 1'
    )
  })
})
