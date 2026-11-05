import type { OrchestrationDb } from '../../runtime/orchestration/db'
import { resolveActiveRootRunId, type OrchestrationRunRow } from './orchestration-active-root-run'
import type {
  OrchestrationNode,
  OrchestrationEdge,
  OrchestrationRootSummary,
  ScopedOrchestrationGraph
} from '../../../shared/plugins/workers/plugin-host-api-orchestration'
import type { PluginAgentStatusRow, PluginWorkspaceTerminal } from './plugin-workspace-projection'

export type OrchestrationGraphProjectionOptions = {
  db: OrchestrationDb | null
  params?: {
    rootRunId?: string
    rootHandle?: string
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
      emptyReason: 'incompatible-host'
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
      emptyReason: 'no-runs'
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

  const selectedRun = runs.find((r) => r.id === selectedRootRunId)
  if (!selectedRun) {
    return {
      activeRootRunId,
      selectedRootRunId,
      roots,
      nodes: [],
      edges: [],
      emptyReason: 'run-not-found'
    }
  }

  // 4. Build Root Node
  const rootCoordinatorHandle = selectedRun.coordinator_handle
  const rootLive = rootCoordinatorHandle ? agentByTerminalId.get(rootCoordinatorHandle) : undefined
  const rootName =
    (rootCoordinatorHandle ? terminalTitleByHandle.get(rootCoordinatorHandle) : null) ??
    'Root Orchestrator'
  const rootCli = rootLive?.agent ?? 'orchestrator'
  const rootState = rootLive?.state ?? 'idle'

  const rootNodeId = `root:${selectedRun.id}`
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
    depth: 0
  }

  const nodes: OrchestrationNode[] = [rootNode]
  const edges: OrchestrationEdge[] = []

  // 5. Query tasks and dispatches for this run
  type TaskPartial = {
    id: string
    run_id: string
    parent_id: string | null
    task_title: string | null
    display_name: string | null
    spec: string
    status: string
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
  const tasks = db.db
    .prepare(
      `SELECT id, run_id, parent_id, task_title, display_name, spec, status
       FROM tasks
       WHERE run_id = ?
       ORDER BY created_at ASC`
    )
    .all(selectedRun.id) as TaskPartial[]

  type DispatchPartial = {
    id: string
    run_id: string
    task_id: string
    assignee_handle: string | null
    assignee_orca_session_id: string | null
    creator_dispatch_id: string | null
    creator_handle: string | null
    depth: number
    status: string
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
  const dispatches = db.db
    .prepare(
      `SELECT id, run_id, task_id, assignee_handle, assignee_orca_session_id,
              creator_dispatch_id, creator_handle, depth, status
       FROM dispatch_contexts
       WHERE run_id = ?
       ORDER BY rowid ASC`
    )
    .all(selectedRun.id) as DispatchPartial[]

  // Find set of dispatch IDs that acted as creator for another dispatch
  const creatorDispatchIds = new Set<string>()
  for (const d of dispatches) {
    if (d.creator_dispatch_id) {
      creatorDispatchIds.add(d.creator_dispatch_id)
    }
  }

  // Worker dispatch state map
  const workerDispatchState = new Map<string, string>()
  if (dispatches.length > 0) {
    const dispatchIds = dispatches.map((d) => d.id)
    const placeholders = dispatchIds.map(() => '?').join(',')
    type WorkerDispatchPartial = { dispatch_id: string; state: string }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
    const wdRows = db.db
      .prepare(
        `SELECT dispatch_id, state FROM worker_dispatches WHERE dispatch_id IN (${placeholders})`
      )
      .all(...dispatchIds) as WorkerDispatchPartial[]
    for (const wd of wdRows) {
      workerDispatchState.set(wd.dispatch_id, wd.state)
    }
  }

  // Index dispatches by task_id
  const dispatchesByTaskId = new Map<string, DispatchPartial[]>()
  for (const d of dispatches) {
    const list = dispatchesByTaskId.get(d.task_id) ?? []
    list.push(d)
    dispatchesByTaskId.set(d.task_id, list)
  }

  // Track created nodes by dispatch_id and by task_id for hierarchy linking
  const nodeByDispatchId = new Map<string, OrchestrationNode>()
  const nodeByTaskId = new Map<string, OrchestrationNode>()

  // Helper to determine node CLI
  const resolveCli = (handle: string | null, specText: string): string => {
    if (handle) {
      const live = agentByTerminalId.get(handle)
      if (live?.agent) {
        return live.agent
      }
    }
    const lower = specText.toLowerCase()
    if (lower.includes('codex')) {
      return 'codex'
    }
    if (lower.includes('claude')) {
      return 'claude'
    }
    if (lower.includes('opencode')) {
      return 'opencode'
    }
    return 'worker'
  }

  for (const task of tasks) {
    const taskDispatches = dispatchesByTaskId.get(task.id) ?? []
    const dispatch =
      taskDispatches.find((d) => d.status === 'dispatched' || d.status === 'pending') ??
      taskDispatches.at(-1)

    const isCreator = dispatch ? creatorDispatchIds.has(dispatch.id) : false
    const role: OrchestrationNode['role'] = isCreator ? 'orchestrator' : 'worker'

    const handle = dispatch?.assignee_handle ?? null
    const terminalTitle = handle ? terminalTitleByHandle.get(handle) : null
    const shortTitle =
      task.task_title ||
      task.display_name ||
      (task.spec.length > 50 ? `${task.spec.slice(0, 47)}...` : task.spec)
    const nodeName = terminalTitle ?? task.task_title ?? `Task ${task.id.slice(0, 8)}`
    const cli = resolveCli(handle, task.spec)

    // Resolve state
    let state = task.status
    if (handle) {
      const live = agentByTerminalId.get(handle)
      if (live?.state) {
        state = live.state
      }
    }
    if (dispatch && workerDispatchState.has(dispatch.id)) {
      state = workerDispatchState.get(dispatch.id)!
    } else if (dispatch && (dispatch.status === 'completed' || dispatch.status === 'failed')) {
      state = dispatch.status
    }

    const nodeId = dispatch ? `node:dispatch:${dispatch.id}` : `node:task:${task.id}`

    // Resolve parent
    let parentId = rootNodeId
    if (dispatch?.creator_dispatch_id && nodeByDispatchId.has(dispatch.creator_dispatch_id)) {
      parentId = nodeByDispatchId.get(dispatch.creator_dispatch_id)!.id
    } else if (task.parent_id && nodeByTaskId.has(task.parent_id)) {
      parentId = nodeByTaskId.get(task.parent_id)!.id
    }

    const node: OrchestrationNode = {
      id: nodeId,
      name: nodeName,
      cli,
      role,
      shortTaskTitle: shortTitle,
      state,
      taskId: task.id,
      dispatchId: dispatch?.id ?? null,
      terminalHandle: handle,
      orcaSessionId: dispatch?.assignee_orca_session_id ?? null,
      parentId,
      depth: dispatch?.depth ?? (parentId === rootNodeId ? 1 : 2)
    }

    nodes.push(node)
    edges.push({ from: parentId, to: nodeId })

    if (dispatch) {
      nodeByDispatchId.set(dispatch.id, node)
    }
    nodeByTaskId.set(task.id, node)
  }

  return {
    activeRootRunId,
    selectedRootRunId,
    roots,
    nodes,
    edges,
    emptyReason: tasks.length === 0 ? 'no-tasks' : null
  }
}
