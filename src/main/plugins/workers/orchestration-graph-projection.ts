import type { OrchestrationDb } from '../../runtime/orchestration/db'
import { resolveActiveRootRunId, type OrchestrationRunRow } from './orchestration-active-root-run'
import type {
  OrchestrationNode,
  OrchestrationRootSummary,
  ScopedOrchestrationGraph,
  OrchestrationSourceFreshness
} from '../../../shared/plugins/workers/plugin-host-api-orchestration'
import type { PluginAgentStatusRow, PluginWorkspaceTerminal } from './plugin-workspace-projection'
import {
  deriveAttention,
  createSourceDisconnectAttentionItem
} from './orchestration-graph-attention'
import { projectTaskNodes } from './orchestration-task-nodes'

export type OrchestrationGraphProjectionOptions = {
  db: OrchestrationDb | null
  params?: {
    rootRunId?: string
    rootHandle?: string
    staleSource?: boolean
  }
  terminals?: readonly PluginWorkspaceTerminal[]
  agentStatuses?: readonly PluginAgentStatusRow[]
}

export function projectScopedOrchestrationGraph(
  options: OrchestrationGraphProjectionOptions
): ScopedOrchestrationGraph {
  const { db, params, terminals = [], agentStatuses = [] } = options

  if (!db) {
    return {
      activeRootRunId: null,
      selectedRootRunId: null,
      roots: [],
      nodes: [],
      edges: [],
      emptyReason: 'incompatible-host',
      attentionItems: [],
      attentionCount: 0,
      sourceFreshness: {
        status: 'disconnected',
        lastUpdatedAt: new Date().toISOString(),
        provenance: 'orca.host.unavailable',
        isVerified: false
      }
    }
  }

  // 1. Fetch available runs
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
  const runs = db.db
    .prepare(
      `SELECT id, objective, coordinator_handle, coordinator_orca_session_id, created_at
       FROM runs
       WHERE legacy = 0
       ORDER BY rowid DESC
       LIMIT 50`
    )
    .all() as OrchestrationRunRow[]

  if (runs.length === 0) {
    return {
      activeRootRunId: null,
      selectedRootRunId: null,
      roots: [],
      nodes: [],
      edges: [],
      emptyReason: 'no-runs',
      attentionItems: [],
      attentionCount: 0,
      sourceFreshness: {
        status: 'live',
        lastUpdatedAt: new Date().toISOString(),
        provenance: 'orca.runtime.db',
        isVerified: true
      }
    }
  }

  // Terminal title map for quick lookup
  const terminalTitleByHandle = new Map<string, string>()
  for (const t of terminals) {
    if (t.title) {
      terminalTitleByHandle.set(t.id, t.title)
    }
  }

  // Agent status and CLI map
  const agentByTerminalId = new Map<string, { agent: string | null; state: string }>()
  for (const a of agentStatuses) {
    if (a.terminalHandle) {
      agentByTerminalId.set(a.terminalHandle, { agent: a.agentType ?? null, state: a.state })
    }
  }

  // Build root summaries
  const roots: OrchestrationRootSummary[] = runs.map((r) => {
    const liveAgent = r.coordinator_handle ? agentByTerminalId.get(r.coordinator_handle) : undefined
    return {
      runId: r.id,
      objective: r.objective,
      coordinatorHandle: r.coordinator_handle,
      coordinatorOrcaSessionId: r.coordinator_orca_session_id,
      createdAt: r.created_at,
      status: liveAgent?.state ?? 'idle'
    }
  })

  // 2. Determine proposed / active root run ID
  const { activeRootRunId, selectedRootRunId } = resolveActiveRootRunId(db, runs, params, terminals)

  const isStale = Boolean(params?.staleSource)
  const sourceFreshness: OrchestrationSourceFreshness = {
    status: isStale ? 'disconnected' : 'live',
    lastUpdatedAt: new Date().toISOString(),
    provenance: isStale ? 'orca.runtime.disconnected' : 'orca.runtime.db',
    isVerified: !isStale
  }

  const selectedRun = runs.find((r) => r.id === selectedRootRunId)
  if (!selectedRun) {
    return {
      activeRootRunId,
      selectedRootRunId,
      roots,
      nodes: [],
      edges: [],
      emptyReason: 'run-not-found',
      attentionItems: [],
      attentionCount: 0,
      sourceFreshness
    }
  }

  // 3. Build Root Node
  const rootCoordinatorHandle = selectedRun.coordinator_handle
  const rootLive = rootCoordinatorHandle ? agentByTerminalId.get(rootCoordinatorHandle) : undefined
  const rootName =
    (rootCoordinatorHandle ? terminalTitleByHandle.get(rootCoordinatorHandle) : null) ??
    'Root Orchestrator'
  const rootCli = rootLive?.agent ?? 'orchestrator'
  const rootState = rootLive?.state ?? 'idle'

  const rootNodeId = `root:${selectedRun.id}`
  const rootAttention = deriveAttention(rootNodeId, rootState, selectedRun.objective, 'Root')

  const rootNode: OrchestrationNode = {
    id: rootNodeId,
    name: rootName,
    cli: rootCli,
    role: 'root-orchestrator',
    shortTaskTitle:
      selectedRun.objective.length > 60
        ? `${selectedRun.objective.slice(0, 57)}...`
        : selectedRun.objective,
    state: rootState,
    taskId: null,
    dispatchId: null,
    terminalHandle: rootCoordinatorHandle,
    orcaSessionId: selectedRun.coordinator_orca_session_id,
    parentId: null,
    depth: 0,
    attention: rootAttention
  }

  // 4. Project task and dispatch nodes
  const taskResult = projectTaskNodes({
    db,
    runId: selectedRun.id,
    rootNodeId,
    terminalTitleByHandle,
    agentByTerminalId
  })

  const nodes: OrchestrationNode[] = [rootNode, ...taskResult.nodes]
  const edges = taskResult.edges
  const attentionItems = rootAttention
    ? [rootAttention, ...taskResult.attentionItems]
    : [...taskResult.attentionItems]

  // If source is stale / disconnected, append unverified telemetry attention item
  if (isStale) {
    attentionItems.push(createSourceDisconnectAttentionItem(selectedRun.id, rootNodeId))
  }

  return {
    activeRootRunId,
    selectedRootRunId,
    roots,
    nodes,
    edges,
    emptyReason: taskResult.taskCount === 0 ? 'no-tasks' : null,
    attentionItems,
    attentionCount: attentionItems.length,
    sourceFreshness
  }
}
