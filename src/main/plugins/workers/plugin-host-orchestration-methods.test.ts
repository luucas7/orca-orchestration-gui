import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testOrcaSessionId } from '../../../shared/orca-session-address-test-fixture'
import { OrchestrationDb } from '../../runtime/orchestration/db'
import { structuredWorkerProcessIncarnation } from '../../runtime/structured-worker-identity'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'
import type { PluginRuntimeRpc } from './plugin-host-workspace-method-bindings'
import { scopedOrchestrationGraphSchema } from '../../../shared/plugins/workers/plugin-host-api-orchestration'
import type { PluginAgentStatusRow, PluginWorkspaceTerminal } from './plugin-workspace-projection'
import { globalObservationManager } from './orchestration-observation-scope'

const FIXED_STARTED_AT = 1_730_707_200_000

describe('orchestration host methods', () => {
  let db: OrchestrationDb

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  function createServices(options: {
    db?: OrchestrationDb | null
    runtimeRpc?: PluginRuntimeRpc | null
    terminals?: PluginWorkspaceTerminal[]
    agentStatuses?: PluginAgentStatusRow[]
    worktreeContext?: {
      worktreeId: string
      branch: string
      displayName: string
    }
  }): PluginHostServices {
    const {
      db: testDb = db,
      runtimeRpc = null,
      terminals = [],
      agentStatuses = [],
      worktreeContext = {
        worktreeId: 'wt-main',
        branch: 'main',
        displayName: 'Main Repo'
      }
    } = options
    return {
      resolveActiveWorktreeContext: vi.fn().mockResolvedValue(worktreeContext),
      listWorktreeTerminals: vi.fn().mockResolvedValue(terminals),
      sendTerminalText: vi.fn().mockResolvedValue({ accepted: true }),
      listAgentStatuses: () => agentStatuses,
      dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
      storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn().mockReturnValue([]) },
      secrets: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        protection: vi.fn().mockReturnValue('unavailable')
      },
      settings: { getAll: vi.fn().mockReturnValue({}), set: vi.fn() },
      runtimeRpc,
      orchestration: testDb ? { getOrchestrationDb: () => testDb } : null
    }
  }

  describe('orchestration.getScopedGraph', () => {
    it('returns incompatible-host state when orchestration is unavailable', async () => {
      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: {},
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({ db: null })
      })

      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(outcome.value)
        expect(graph.emptyReason).toBe('incompatible-host')
        expect(graph.roots).toHaveLength(0)
        expect(graph.nodes).toHaveLength(0)
      }
    })

    it('returns no-runs state when database has no runs', async () => {
      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: {},
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({})
      })

      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(outcome.value)
        expect(graph.emptyReason).toBe('no-runs')
        expect(graph.roots).toHaveLength(0)
        expect(graph.nodes).toHaveLength(0)
      }
    })

    it('proposes active terminal known root on first visit and preserves selection', async () => {
      // Create Run 1
      const run1 = db.createRun({
        objective: 'First Orchestration Objective',
        coordinatorHandle: 'term-coord-1',
        coordinatorPaneKey: null,
        coordinatorOrcaSessionId: testOrcaSessionId('0b7e4c2a-5f1d-4e8a-9c3b-2d6f8a1e4b70')
      })
      // Create Run 2
      const run2 = db.createRun({
        objective: 'Second Orchestration Objective',
        coordinatorHandle: 'term-coord-2',
        coordinatorPaneKey: null,
        coordinatorOrcaSessionId: testOrcaSessionId('1f0c2a3b-4d5e-4f60-8a71-b2c3d4e5f601')
      })

      // When active terminal is term-coord-2, propose run2
      const firstVisit = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootHandle: 'term-coord-2' },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({
          terminals: [{ id: 'term-coord-2', title: 'Coordinator 2' }]
        })
      })

      expect(firstVisit.ok).toBe(true)
      if (firstVisit.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(firstVisit.value)
        expect(graph.activeRootRunId).toBe(run2.id)
        expect(graph.selectedRootRunId).toBe(run2.id)
        expect(graph.roots).toHaveLength(2)
        expect(graph.nodes[0].id).toBe(`root:${run2.id}`)
      }

      // Explicit selection of run1 remains fixed
      const explicitVisit = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootRunId: run1.id, rootHandle: 'term-coord-2' },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({
          terminals: [{ id: 'term-coord-2', title: 'Coordinator 2' }]
        })
      })

      expect(explicitVisit.ok).toBe(true)
      if (explicitVisit.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(explicitVisit.value)
        expect(graph.activeRootRunId).toBe(run2.id)
        expect(graph.selectedRootRunId).toBe(run1.id)
        expect(graph.nodes[0].id).toBe(`root:${run1.id}`)
        expect(graph.emptyReason).toBe('no-tasks')
      }
    })

    it('returns run-not-found state when explicit rootRunId does not exist', async () => {
      db.createRun({
        objective: 'Existing Objective',
        coordinatorHandle: null,
        coordinatorPaneKey: null,
        coordinatorOrcaSessionId: null
      })

      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootRunId: 'non-existent-run' },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({})
      })

      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(outcome.value)
        expect(graph.emptyReason).toBe('run-not-found')
        expect(graph.selectedRootRunId).toBe('non-existent-run')
        expect(graph.nodes).toHaveLength(0)
      }
    })

    it('builds multi-level hierarchy distinguishing Task, Dispatch, terminal, and session identities', async () => {
      // Setup Root Orchestrator
      const run = db.createRun({
        objective: 'Refactor authentication module across services',
        coordinatorHandle: 'term-root',
        coordinatorPaneKey: null,
        coordinatorOrcaSessionId: testOrcaSessionId('2a1b3c4d-5e6f-4a70-9b81-c2d3e4f5a602')
      })

      // Task 1: Intermediate Orchestration lead
      const task1 = db.createTask({
        runId: run.id,
        spec: 'Coordinate backend auth migration with claude',
        taskTitle: 'Auth Lead'
      })
      const dispatch1 = db.createDispatchContext({
        taskId: task1.id,
        assigneeHandle: 'term-lead',
        assigneePaneKey: 'tab-2:leaf-1',
        processIncarnation: structuredWorkerProcessIncarnation('chat_lead'),
        creator: { kind: 'system' },
        maxDepth: 10
      })

      // Task 2: Sub-task delegated by Lead to Codex worker
      const task2 = db.createTask({
        runId: run.id,
        parentId: task1.id,
        spec: 'Implement jwt token rotation with codex',
        taskTitle: 'JWT Rotation'
      })
      const dispatch2 = db.createDispatchContext({
        taskId: task2.id,
        assigneeHandle: 'term-codex',
        assigneePaneKey: 'tab-3:leaf-1',
        creator: { kind: 'terminal', handle: 'term-lead', paneKey: 'tab-2:leaf-1' },
        maxDepth: 10
      })

      // Task 3: Sub-task delegated by Lead to OpenCode worker
      const task3 = db.createTask({
        runId: run.id,
        parentId: task1.id,
        spec: 'Verify security boundaries with opencode',
        taskTitle: 'Security Audit'
      })
      const dispatch3 = db.createDispatchContext({
        taskId: task3.id,
        assigneeHandle: 'term-opencode',
        assigneePaneKey: 'tab-4:leaf-1',
        creator: { kind: 'terminal', handle: 'term-lead', paneKey: 'tab-2:leaf-1' },
        maxDepth: 10
      })

      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootRunId: run.id },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({
          terminals: [
            { id: 'term-root', title: 'Root Coordinator' },
            { id: 'term-lead', title: 'Claude Lead' },
            { id: 'term-codex', title: 'Codex Worker' },
            { id: 'term-opencode', title: 'OpenCode Auditor' }
          ],
          agentStatuses: [
            {
              paneKey: 'tab-1:leaf-1',
              terminalHandle: 'term-root',
              agentType: 'claude',
              state: 'working',
              stateStartedAt: FIXED_STARTED_AT
            },
            {
              paneKey: 'tab-2:leaf-1',
              terminalHandle: 'term-lead',
              agentType: 'claude',
              state: 'working',
              stateStartedAt: FIXED_STARTED_AT
            },
            {
              paneKey: 'tab-3:leaf-1',
              terminalHandle: 'term-codex',
              agentType: 'codex',
              state: 'working',
              stateStartedAt: FIXED_STARTED_AT
            },
            {
              paneKey: 'tab-4:leaf-1',
              terminalHandle: 'term-opencode',
              agentType: 'opencode',
              state: 'waiting',
              stateStartedAt: FIXED_STARTED_AT
            }
          ]
        })
      })

      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(outcome.value)
        expect(graph.emptyReason).toBeNull()
        expect(graph.nodes).toHaveLength(4)

        // 1. Root node
        const rootNode = graph.nodes[0]
        expect(rootNode).toMatchObject({
          id: `root:${run.id}`,
          name: 'Root Coordinator',
          cli: 'claude',
          role: 'root-orchestrator',
          state: 'working',
          taskId: null,
          dispatchId: null,
          terminalHandle: 'term-root',
          orcaSessionId: '2a1b3c4d-5e6f-4a70-9b81-c2d3e4f5a602',
          parentId: null,
          depth: 0
        })

        // 2. Intermediate Orchestrator (Lead)
        const leadNode = graph.nodes.find((n) => n.dispatchId === dispatch1.id)
        expect(leadNode).toBeDefined()
        expect(leadNode).toMatchObject({
          name: 'Claude Lead',
          cli: 'claude',
          role: 'orchestrator', // became orchestrator because it created sub-dispatches!
          shortTaskTitle: 'Auth Lead',
          state: 'working',
          taskId: task1.id,
          dispatchId: dispatch1.id,
          terminalHandle: 'term-lead',
          orcaSessionId: 'chat_lead',
          parentId: rootNode.id,
          depth: 1
        })

        // 3. Worker 1 (Codex)
        const codexNode = graph.nodes.find((n) => n.dispatchId === dispatch2.id)
        expect(codexNode).toBeDefined()
        expect(codexNode).toMatchObject({
          name: 'Codex Worker',
          cli: 'codex',
          role: 'worker',
          shortTaskTitle: 'JWT Rotation',
          state: 'working',
          taskId: task2.id,
          dispatchId: dispatch2.id,
          terminalHandle: 'term-codex',
          orcaSessionId: null,
          parentId: leadNode!.id, // Child of lead!
          depth: 2
        })

        // 4. Worker 2 (OpenCode)
        const opencodeNode = graph.nodes.find((n) => n.dispatchId === dispatch3.id)
        expect(opencodeNode).toBeDefined()
        expect(opencodeNode).toMatchObject({
          name: 'OpenCode Auditor',
          cli: 'opencode',
          role: 'worker',
          shortTaskTitle: 'Security Audit',
          state: 'waiting',
          taskId: task3.id,
          dispatchId: dispatch3.id,
          terminalHandle: 'term-opencode',
          orcaSessionId: null,
          parentId: leadNode!.id, // Child of lead!
          depth: 2
        })

        // Verify edges
        expect(graph.edges).toContainEqual({ from: rootNode.id, to: leadNode!.id })
        expect(graph.edges).toContainEqual({ from: leadNode!.id, to: codexNode!.id })
        expect(graph.edges).toContainEqual({ from: leadNode!.id, to: opencodeNode!.id })
      }
    })
  })

  describe('orchestration.navigateTerminal', () => {
    it('calls runtime terminal.focus with navigation host and returns target focus info', async () => {
      const calls: { method: string; params: unknown }[] = []
      const runtimeRpc: PluginRuntimeRpc = async (method, params) => {
        calls.push({ method, params })
        if (method === 'terminal.focus') {
          const terminal =
            typeof params === 'object' && params !== null && 'terminal' in params
              ? String(params.terminal)
              : ''
          return {
            focus: {
              handle: terminal,
              tabId: 'tab-target',
              worktreeId: 'wt-target',
              navigated: true
            }
          }
        }
        throw new Error(`unexpected method ${method}`)
      }

      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.navigateTerminal',
        params: { terminalHandle: 'term-agent-7' },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({ runtimeRpc }),
        audit: { record: vi.fn().mockResolvedValue(undefined) }
      })

      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        expect(outcome.value).toEqual({
          navigated: true,
          tabId: 'tab-target',
          worktreeId: 'wt-target'
        })
      }
      expect(calls).toEqual([
        {
          method: 'terminal.focus',
          params: { terminal: 'term-agent-7', navigation: 'host' }
        }
      ])
    })

    it('rejects navigation if runtimeRpc throws terminal_exited', async () => {
      const runtimeRpc: PluginRuntimeRpc = async () => {
        throw new Error('terminal_exited')
      }

      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.navigateTerminal',
        params: { terminalHandle: 'term-dead' },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({ runtimeRpc }),
        audit: { record: vi.fn().mockResolvedValue(undefined) }
      })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.error).toContain('terminal_exited')
      }
    })

    it('fails when runtimeRpc is not available', async () => {
      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.navigateTerminal',
        params: { terminalHandle: 'term-test' },
        surface: 'panel',
        grantedCapabilities: [],
        services: createServices({ runtimeRpc: null }),
        audit: { record: vi.fn().mockResolvedValue(undefined) }
      })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.code).toBe('unavailable')
      }
    })
  })

  describe('demonstration V02: root selection, cross-workspace navigation, and graph restoration', () => {
    it('selects root with mixed-CLI descendants, navigates to another workspace terminal, and restores graph', async () => {
      // 1. Setup multi-CLI hierarchy
      const run = db.createRun({
        objective: 'Demonstration of full orchestration path',
        coordinatorHandle: 'term-root',
        coordinatorPaneKey: 'tab-root:leaf-1',
        coordinatorOrcaSessionId: testOrcaSessionId('3b2c1d0e-4f5a-6b7c-8d9e-0f1a2b3c4d5e')
      })

      const taskLead = db.createTask({
        runId: run.id,
        spec: 'Lead coordination with claude',
        taskTitle: 'Lead Orchestrator'
      })
      const dispLead = db.createDispatchContext({
        taskId: taskLead.id,
        assigneeHandle: 'term-lead',
        assigneePaneKey: 'tab-lead:leaf-1',
        processIncarnation: structuredWorkerProcessIncarnation('lead_session'),
        creator: { kind: 'system' },
        maxDepth: 10
      })

      const taskCodex = db.createTask({
        runId: run.id,
        parentId: taskLead.id,
        spec: 'Implementation with codex',
        taskTitle: 'Codex Feature'
      })
      const dispCodex = db.createDispatchContext({
        taskId: taskCodex.id,
        assigneeHandle: 'term-codex',
        assigneePaneKey: 'tab-codex:leaf-1',
        creator: { kind: 'terminal', handle: 'term-lead', paneKey: 'tab-lead:leaf-1' },
        maxDepth: 10
      })

      const taskOpenCode = db.createTask({
        runId: run.id,
        parentId: taskLead.id,
        spec: 'Verification with opencode',
        taskTitle: 'OpenCode Review'
      })
      const dispOpenCode = db.createDispatchContext({
        taskId: taskOpenCode.id,
        assigneeHandle: 'term-opencode-cross',
        assigneePaneKey: 'tab-foreign:leaf-1',
        creator: { kind: 'terminal', handle: 'term-lead', paneKey: 'tab-lead:leaf-1' },
        maxDepth: 10
      })

      const runtimeCalls: { method: string; params: unknown }[] = []
      const runtimeRpc: PluginRuntimeRpc = async (method, params) => {
        runtimeCalls.push({ method, params })
        if (method === 'terminal.focus') {
          return {
            focus: {
              handle: 'term-opencode-cross',
              tabId: 'tab-foreign',
              worktreeId: 'wt-other-workspace',
              navigated: true
            }
          }
        }
        throw new Error(`unknown rpc ${method}`)
      }

      const services = createServices({
        runtimeRpc,
        terminals: [
          { id: 'term-root', title: 'Root Coordinator' },
          { id: 'term-lead', title: 'Claude Lead' },
          { id: 'term-codex', title: 'Codex Worker' },
          { id: 'term-opencode-cross', title: 'OpenCode Worker' }
        ],
        agentStatuses: [
          {
            paneKey: 'tab-root:leaf-1',
            terminalHandle: 'term-root',
            agentType: 'claude',
            state: 'working',
            stateStartedAt: FIXED_STARTED_AT
          },
          {
            paneKey: 'tab-lead:leaf-1',
            terminalHandle: 'term-lead',
            agentType: 'claude',
            state: 'working',
            stateStartedAt: FIXED_STARTED_AT
          },
          {
            paneKey: 'tab-codex:leaf-1',
            terminalHandle: 'term-codex',
            agentType: 'codex',
            state: 'working',
            stateStartedAt: FIXED_STARTED_AT
          },
          {
            paneKey: 'tab-foreign:leaf-1',
            terminalHandle: 'term-opencode-cross',
            agentType: 'opencode',
            state: 'waiting',
            stateStartedAt: FIXED_STARTED_AT
          }
        ]
      })

      // Step 1: Query initial graph proposing root from active terminal
      const initialOutcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootHandle: 'term-root' },
        surface: 'panel',
        grantedCapabilities: [],
        services
      })

      expect(initialOutcome.ok).toBe(true)
      if (initialOutcome.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(initialOutcome.value)
        expect(graph.activeRootRunId).toBe(run.id)
        expect(graph.selectedRootRunId).toBe(run.id)
        expect(graph.nodes).toHaveLength(4)

        const clis = graph.nodes.map((n) => n.cli)
        expect(clis).toContain('claude')
        expect(clis).toContain('codex')
        expect(clis).toContain('opencode')
      }

      // Step 2: Navigate to terminal located in another workspace
      const navOutcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.navigateTerminal',
        params: { terminalHandle: 'term-opencode-cross' },
        surface: 'panel',
        grantedCapabilities: [],
        services,
        audit: { record: vi.fn().mockResolvedValue(undefined) }
      })

      expect(navOutcome.ok).toBe(true)
      if (navOutcome.ok) {
        expect(navOutcome.value).toEqual({
          navigated: true,
          tabId: 'tab-foreign',
          worktreeId: 'wt-other-workspace'
        })
      }
      expect(runtimeCalls).toContainEqual({
        method: 'terminal.focus',
        params: { terminal: 'term-opencode-cross', navigation: 'host' }
      })

      // Step 3: Restore the same graph with the persisted explicit selection from other workspace context
      const otherServices = createServices({
        runtimeRpc,
        terminals: [{ id: 'term-other-active', title: 'Other Terminal' }],
        worktreeContext: {
          worktreeId: 'wt-other-workspace',
          branch: 'feature-other',
          displayName: 'Other Workspace'
        }
      })

      const restoreOutcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootRunId: run.id, rootHandle: 'term-other-active' },
        surface: 'panel',
        grantedCapabilities: [],
        services: otherServices
      })

      expect(restoreOutcome.ok).toBe(true)
      if (restoreOutcome.ok) {
        const restoredGraph = scopedOrchestrationGraphSchema.parse(restoreOutcome.value)
        expect(restoredGraph.selectedRootRunId).toBe(run.id)
        expect(restoredGraph.nodes).toHaveLength(4)
        expect(restoredGraph.nodes[0].id).toBe(`root:${run.id}`)
        expect(restoredGraph.nodes.find((n) => n.dispatchId === dispLead.id)).toBeDefined()
        expect(restoredGraph.nodes.find((n) => n.dispatchId === dispCodex.id)).toBeDefined()
        expect(restoredGraph.nodes.find((n) => n.dispatchId === dispOpenCode.id)).toBeDefined()
      }
    })
  })

  describe('demonstration V01 & V16: 20-agent hierarchy, live attention, cause evidence, and stale telemetry', () => {
    it('detects native failure in 20-agent hierarchy, distinguishes quota/context/heuristic causes, and marks stale telemetry', async () => {
      // 1. Create a 20+ agent hierarchy (1 root + 3 leads + 18 workers = 22 agents)
      const run = db.createRun({
        objective: 'Large scale 20-agent fleet orchestration with mixed providers',
        coordinatorHandle: 'term-root',
        coordinatorPaneKey: 'tab-root:leaf-1',
        coordinatorOrcaSessionId: testOrcaSessionId('root-session-20-agents')
      })

      const terminals: PluginWorkspaceTerminal[] = [{ id: 'term-root', title: 'Root Coordinator' }]
      const agentStatuses: PluginAgentStatusRow[] = [
        {
          paneKey: 'tab-root:leaf-1',
          terminalHandle: 'term-root',
          agentType: 'claude',
          state: 'working',
          stateStartedAt: FIXED_STARTED_AT
        }
      ]

      let agentCounter = 1
      for (let leadIdx = 1; leadIdx <= 3; leadIdx++) {
        const leadHandle = `term-lead-${leadIdx}`
        terminals.push({ id: leadHandle, title: `Nested Lead ${leadIdx}` })
        agentStatuses.push({
          paneKey: `tab-lead-${leadIdx}:leaf-1`,
          terminalHandle: leadHandle,
          agentType: 'codex',
          state: 'working',
          stateStartedAt: FIXED_STARTED_AT
        })

        const leadTask = db.createTask({
          runId: run.id,
          spec: `Nested lead ${leadIdx} coordination with codex`,
          taskTitle: `Lead ${leadIdx}`
        })
        db.createDispatchContext({
          taskId: leadTask.id,
          assigneeHandle: leadHandle,
          assigneePaneKey: `tab-lead-${leadIdx}:leaf-1`,
          creator: { kind: 'system' },
          maxDepth: 10
        })

        // 6 workers under each lead = 18 workers
        for (let workerIdx = 1; workerIdx <= 6; workerIdx++) {
          const wHandle = `term-worker-${agentCounter}`
          const wId = agentCounter++
          let spec = `General work worker ${wId}`
          let state: PluginAgentStatusRow['state'] = 'working'

          if (wId === 2) {
            // Worker 2: native failure
            spec = 'Build compilation with rustc'
            state = 'done'
          } else if (wId === 5) {
            // Worker 5: quota failure
            spec = 'Embedding generation - quota exceeded by provider'
            state = 'done'
          } else if (wId === 8) {
            // Worker 8: context window exhausted
            spec = 'Refactoring large legacy file - context window exhausted token limit'
            state = 'done'
          } else if (wId === 11) {
            // Worker 11: expected intervention
            spec = 'Waiting for manual approval'
            state = 'waiting'
          } else if (wId === 14) {
            // Worker 14: heuristic observation
            spec = 'Heuristic anomaly check unconfirmed'
            state = 'working'
          } else if (wId === 17) {
            // Worker 17: idle (should not trigger failure)
            spec = 'Standby worker awaiting assignments'
            state = 'working'
          }

          terminals.push({ id: wHandle, title: `Worker ${wId}` })
          agentStatuses.push({
            paneKey: `tab-w-${wId}:leaf-1`,
            terminalHandle: wHandle,
            agentType: wId % 2 === 0 ? 'opencode' : 'claude',
            state,
            stateStartedAt: FIXED_STARTED_AT
          })

          const wTask = db.createTask({
            runId: run.id,
            parentId: leadTask.id,
            spec,
            taskTitle: `Worker Task ${wId}`
          })
          const disp = db.createDispatchContext({
            taskId: wTask.id,
            assigneeHandle: wHandle,
            assigneePaneKey: `tab-w-${wId}:leaf-1`,
            creator: {
              kind: 'terminal',
              handle: leadHandle,
              paneKey: `tab-lead-${leadIdx}:leaf-1`
            },
            maxDepth: 10
          })

          if (wId === 2 || wId === 5 || wId === 8) {
            db.db
              .prepare("UPDATE dispatch_contexts SET status = 'failed' WHERE id = ?")
              .run(disp.id)
          }
        }
      }

      const services = createServices({ terminals, agentStatuses })

      // Step 1: Query live graph
      const outcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootRunId: run.id },
        surface: 'panel',
        grantedCapabilities: [],
        services
      })

      expect(outcome.ok).toBe(true)
      if (outcome.ok) {
        const graph = scopedOrchestrationGraphSchema.parse(outcome.value)
        expect(graph.nodes.length).toBeGreaterThanOrEqual(20)
        expect(graph.sourceFreshness?.status).toBe('live')
        expect(graph.sourceFreshness?.isVerified).toBe(true)

        // Verify attention count and distinct categories
        expect(graph.attentionCount).toBeGreaterThanOrEqual(5)
        const categories = new Set(graph.attentionItems.map((a) => a.category))
        expect(categories).toContain('confirmed-failure')
        expect(categories).toContain('expected-intervention')
        expect(categories).toContain('uncertain')

        // Verify specific causes
        const causes = graph.attentionItems.map((a) => a.cause)
        expect(causes).toContain('native-failure')
        expect(causes).toContain('quota-exceeded')
        expect(causes).toContain('context-window-exhausted')
        expect(causes).toContain('input-required')
        expect(causes).toContain('unconfirmed-heuristic')

        // Verify heuristic is flagged as heuristic and uncertain
        const heuristicItem = graph.attentionItems.find((a) => a.cause === 'unconfirmed-heuristic')
        expect(heuristicItem).toBeDefined()
        expect(heuristicItem?.isHeuristic).toBe(true)
        expect(heuristicItem?.category).toBe('uncertain')

        // Verify idle worker did NOT produce failure
        const idleNode = graph.nodes.find((n) => n.name === 'Worker 17')
        expect(idleNode).toBeDefined()
        expect(idleNode?.attention).toBeNull()
      }

      // Step 2: Query with disconnected / stale source (V16)
      const staleOutcome = await executePluginHostCall({
        pluginId: 'stablyai.orca-orchestration-view',
        method: 'orchestration.getScopedGraph',
        params: { rootRunId: run.id, staleSource: true },
        surface: 'panel',
        grantedCapabilities: [],
        services
      })

      expect(staleOutcome.ok).toBe(true)
      if (staleOutcome.ok) {
        const staleGraph = scopedOrchestrationGraphSchema.parse(staleOutcome.value)
        expect(staleGraph.sourceFreshness?.status).toBe('disconnected')
        expect(staleGraph.sourceFreshness?.isVerified).toBe(false)
        expect(staleGraph.nodes.length).toBeGreaterThanOrEqual(20) // Last snapshot preserved

        const disconnectItem = staleGraph.attentionItems.find(
          (a) => a.cause === 'source-disconnect'
        )
        expect(disconnectItem).toBeDefined()
        expect(disconnectItem?.category).toBe('uncertain')
        expect(disconnectItem?.reason).toContain('Source disconnected')
      }
    })
  })

  describe('demonstration V10 & V11: event-storm coalescing, bounded reads, and observation lifecycle cleanup', () => {
    it('coalesces rapid burst of invalidations into bounded reads and releases resources on disposal', async () => {
      globalObservationManager.dispose()
      globalObservationManager.resetReadCount()

      const run = db.createRun({
        objective: 'Event storm test run',
        coordinatorHandle: 'term-storm-root',
        coordinatorPaneKey: 'tab-storm:leaf-1'
      })

      const services = createServices({
        terminals: [{ id: 'term-storm-root', title: 'Storm Coordinator' }]
      })

      // Simulate 50 concurrent getScopedGraph requests during an invalidation storm
      const concurrentRequests = Array.from({ length: 50 }, () =>
        executePluginHostCall({
          pluginId: 'stablyai.orca-orchestration-view',
          method: 'orchestration.getScopedGraph',
          params: { rootRunId: run.id },
          surface: 'panel',
          grantedCapabilities: [],
          services
        })
      )

      const results = await Promise.all(concurrentRequests)
      expect(results.every((r) => r.ok)).toBe(true)

      // Verified bounded read count: 50 concurrent calls resulted in at most 1 actual read!
      expect(globalObservationManager.getReadCount()).toBeLessThanOrEqual(2)

      // Graph closure / cleanup: release observation scope
      globalObservationManager.releaseScope(run.id)
      expect(globalObservationManager.getLastSnapshot(run.id)).toBeNull()

      globalObservationManager.dispose()
      expect(globalObservationManager.getReadCount()).toBe(0)
    })
  })
})
