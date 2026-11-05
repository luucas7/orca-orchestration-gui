import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { OrchestrationDb } from '../../runtime/orchestration/db'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'
import {
  orchestrationDeclareSurveillanceLinkResult,
  scopedOrchestrationGraphSchema
} from '../../../shared/plugins/workers/plugin-host-api-orchestration'

describe('orchestration surveillance links (host API)', () => {
  let tmpDir: string
  let dbPath: string
  let db: OrchestrationDb

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orca-surveillance-test-'))
    dbPath = join(tmpDir, 'orchestration.db')
    db = new OrchestrationDb(dbPath)
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function createServices(options: { db?: OrchestrationDb | null }): PluginHostServices {
    const testDb = options.db !== undefined ? options.db : db
    return {
      resolveActiveWorktreeContext: vi.fn().mockResolvedValue({
        worktreeId: 'wt-surveillance',
        branch: 'main',
        displayName: 'Surveillance Test'
      }),
      listWorktreeTerminals: vi.fn().mockResolvedValue([]),
      sendTerminalText: vi.fn().mockResolvedValue({ accepted: true }),
      listAgentStatuses: () => [],
      dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
      storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn().mockReturnValue([]) },
      secrets: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        protection: vi.fn().mockReturnValue('unavailable')
      },
      settings: { getAll: vi.fn().mockReturnValue({}), set: vi.fn() },
      runtimeRpc: null,
      orchestration: testDb ? { getOrchestrationDb: () => testDb } : null
    }
  }

  function seedRun(runId: string, objective: string): void {
    db.db
      .prepare(
        `INSERT INTO runs (id, objective, coordinator_handle, coordinator_orca_session_id, legacy, created_at)
         VALUES (?, ?, 'term-lead', 'sess-lead', 0, '2026-11-04T07:00:00Z')`
      )
      .run(runId, objective)
  }

  function declareLink(params: Record<string, unknown>, testDb?: OrchestrationDb) {
    return executePluginHostCall({
      pluginId: 'stablyai.orca-orchestration-view',
      method: 'orchestration.declareSurveillanceLink',
      params,
      surface: 'panel',
      grantedCapabilities: [],
      audit: { record: vi.fn().mockResolvedValue(undefined) },
      services: createServices({ db: testDb })
    })
  }

  function getGraph(rootRunId: string, testDb?: OrchestrationDb) {
    return executePluginHostCall({
      pluginId: 'stablyai.orca-orchestration-view',
      method: 'orchestration.getScopedGraph',
      params: { rootRunId },
      surface: 'panel',
      grantedCapabilities: [],
      services: createServices({ db: testDb })
    })
  }

  it('declares a surveillance link and persists across restart', async () => {
    seedRun('run-alpha', 'Lead Alpha Orchestration')

    const outcome = await declareLink({
      watcherHandle: 'term-watch-1',
      watcherOrcaSessionId: 'sess-watch-1',
      watcherName: 'Watch-Codex Alpha',
      watcherCli: 'codex',
      targetRunId: 'run-alpha',
      targetNodeId: 'root:run-alpha',
      declaredBy: 'human:alice'
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) {
      return
    }

    const result = orchestrationDeclareSurveillanceLinkResult.parse(outcome.value)
    expect(result.declared).toBe(true)
    expect(result.link.targetRunId).toBe('run-alpha')
    expect(result.link.watcherName).toBe('Watch-Codex Alpha')

    // Simulate restart by closing DB and reopening
    db.close()
    const restartedDb = new OrchestrationDb(dbPath)
    db = restartedDb

    const graphOutcome = await getGraph('run-alpha', restartedDb)

    expect(graphOutcome.ok).toBe(true)
    if (!graphOutcome.ok) {
      return
    }
    const graph = scopedOrchestrationGraphSchema.parse(graphOutcome.value)

    const watcherNode = graph.nodes.find((n) => n.role === 'watcher')
    expect(watcherNode).toBeDefined()
    expect(watcherNode?.name).toBe('Watch-Codex Alpha')
    expect(watcherNode?.cli).toBe('codex')

    const surveillanceEdge = graph.edges.find((e) => e.linkType === 'surveillance')
    expect(surveillanceEdge).toBeDefined()
    expect(surveillanceEdge?.from).toBe(watcherNode?.id)
    expect(surveillanceEdge?.to).toBe('root:run-alpha')
  })

  it('rejects declaration when target run does not exist', async () => {
    const outcome = await declareLink({
      watcherHandle: 'term-watch-x',
      watcherName: 'Ghost Watcher',
      watcherCli: 'codex',
      targetRunId: 'non-existent-run',
      declaredBy: 'human:alice'
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('invalid_params')
    }
  })

  it('rejects declaration with mismatched task belonging to another run', async () => {
    seedRun('run-alpha', 'Alpha Orchestration')
    seedRun('run-beta', 'Beta Orchestration')

    db.db
      .prepare(
        `INSERT INTO tasks (id, run_id, task_title, spec, status, created_at)
         VALUES ('task-beta', 'run-beta', 'Beta Task', 'Do beta', 'dispatched', '2026-11-04T07:05:00Z')`
      )
      .run()

    const outcome = await declareLink({
      watcherHandle: 'term-watch-y',
      watcherName: 'Cross Watcher',
      watcherCli: 'codex',
      targetRunId: 'run-alpha',
      targetTaskId: 'task-beta',
      declaredBy: 'human:alice'
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.code).toBe('invalid_params')
    }
  })

  it('demonstration V01, V19, Stories 6 & 7: external Watcher monitors multiple roots; each scoped view excludes unrelated scopes across restart', async () => {
    seedRun('run-alpha', 'Alpha Root')
    seedRun('run-beta', 'Beta Root')

    db.db
      .prepare(
        `INSERT INTO tasks (id, run_id, task_title, spec, status, created_at)
         VALUES ('task-alpha-1', 'run-alpha', 'Alpha Task 1', 'Work on alpha', 'dispatched', '2026-11-04T07:01:00Z')`
      )
      .run()
    db.db
      .prepare(
        `INSERT INTO tasks (id, run_id, task_title, spec, status, created_at)
         VALUES ('task-beta-1', 'run-beta', 'Beta Task 1', 'Work on beta', 'dispatched', '2026-11-04T07:02:00Z')`
      )
      .run()

    // Declare surveillance for Watcher on alpha
    const declareAlpha = await declareLink({
      watcherHandle: 'term-watcher-shared',
      watcherOrcaSessionId: 'sess-watcher-shared',
      watcherName: 'Shared Watcher Agent',
      watcherCli: 'codex',
      targetRunId: 'run-alpha',
      targetNodeId: 'root:run-alpha',
      declaredBy: 'agent:sentinel'
    })
    expect(declareAlpha.ok).toBe(true)

    // Declare surveillance for SAME Watcher on beta
    const declareBeta = await declareLink({
      watcherHandle: 'term-watcher-shared',
      watcherOrcaSessionId: 'sess-watcher-shared',
      watcherName: 'Shared Watcher Agent',
      watcherCli: 'codex',
      targetRunId: 'run-beta',
      targetTaskId: 'task-beta-1',
      declaredBy: 'agent:sentinel'
    })
    expect(declareBeta.ok).toBe(true)

    // Inspect alpha scope
    const graphAlphaOutcome = await getGraph('run-alpha')
    expect(graphAlphaOutcome.ok).toBe(true)
    if (!graphAlphaOutcome.ok) {
      return
    }
    const graphAlpha = scopedOrchestrationGraphSchema.parse(graphAlphaOutcome.value)

    // Watcher appears in Alpha scope
    const watcherInAlpha = graphAlpha.nodes.find((n) => n.role === 'watcher')
    expect(watcherInAlpha).toBeDefined()
    expect(watcherInAlpha?.id).toBe('node:watcher:term-watcher-shared')

    // Alpha nodes exist in graph
    expect(graphAlpha.nodes.some((n) => n.id === 'root:run-alpha')).toBe(true)
    expect(graphAlpha.nodes.some((n) => n.id === 'node:task:task-alpha-1')).toBe(true)

    // CRITICAL: Beta root and Beta tasks MUST NOT be present in Alpha scope
    expect(graphAlpha.nodes.some((n) => n.id === 'root:run-beta')).toBe(false)
    expect(graphAlpha.nodes.some((n) => n.id === 'node:task:task-beta-1')).toBe(false)
    expect(graphAlpha.edges.some((e) => e.to === 'root:run-beta')).toBe(false)

    // Surveillance link in alpha goes to root:run-alpha
    const survEdgeAlpha = graphAlpha.edges.find((e) => e.linkType === 'surveillance')
    expect(survEdgeAlpha).toBeDefined()
    expect(survEdgeAlpha?.from).toBe('node:watcher:term-watcher-shared')
    expect(survEdgeAlpha?.to).toBe('root:run-alpha')

    // Restart app / recreate DB connection
    db.close()
    const restartedDb = new OrchestrationDb(dbPath)
    db = restartedDb

    // Inspect beta scope on restarted DB
    const graphBetaOutcome = await getGraph('run-beta', restartedDb)
    expect(graphBetaOutcome.ok).toBe(true)
    if (!graphBetaOutcome.ok) {
      return
    }
    const graphBeta = scopedOrchestrationGraphSchema.parse(graphBetaOutcome.value)

    // Watcher appears in Beta scope
    const watcherInBeta = graphBeta.nodes.find((n) => n.role === 'watcher')
    expect(watcherInBeta).toBeDefined()
    expect(watcherInBeta?.id).toBe('node:watcher:term-watcher-shared')

    // Beta nodes exist
    expect(graphBeta.nodes.some((n) => n.id === 'root:run-beta')).toBe(true)
    expect(graphBeta.nodes.some((n) => n.id === 'node:task:task-beta-1')).toBe(true)

    // CRITICAL: Alpha root and Alpha tasks MUST NOT be present in Beta scope
    expect(graphBeta.nodes.some((n) => n.id === 'root:run-alpha')).toBe(false)
    expect(graphBeta.nodes.some((n) => n.id === 'node:task:task-alpha-1')).toBe(false)

    // Surveillance link in beta goes to node:task:task-beta-1
    const survEdgeBeta = graphBeta.edges.find((e) => e.linkType === 'surveillance')
    expect(survEdgeBeta).toBeDefined()
    expect(survEdgeBeta?.from).toBe('node:watcher:term-watcher-shared')
    expect(survEdgeBeta?.to).toBe('node:task:task-beta-1')
  })
})
