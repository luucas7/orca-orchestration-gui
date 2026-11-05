import type { OrchestrationDb } from '../../runtime/orchestration/db'
import type {
  OrchestrationAttentionItem,
  OrchestrationEdge,
  OrchestrationNode
} from '../../../shared/plugins/workers/plugin-host-api-orchestration'
import { deriveAttention } from './orchestration-graph-attention'

export type TaskNodesProjectionOptions = {
  db: OrchestrationDb
  runId: string
  rootNodeId: string
  terminalTitleByHandle: ReadonlyMap<string, string>
  agentByTerminalId: ReadonlyMap<string, { agent: string | null; state: string }>
}

export type TaskNodesProjectionResult = {
  nodes: OrchestrationNode[]
  edges: OrchestrationEdge[]
  attentionItems: OrchestrationAttentionItem[]
  taskCount: number
}

type TaskPartial = {
  id: string
  run_id: string
  parent_id: string | null
  task_title: string | null
  display_name: string | null
  spec: string
  status: string
}

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

function resolveCli(
  handle: string | null,
  specText: string,
  agentByTerminalId: ReadonlyMap<string, { agent: string | null; state: string }>
): string {
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

export function projectTaskNodes(options: TaskNodesProjectionOptions): TaskNodesProjectionResult {
  const { db, runId, rootNodeId, terminalTitleByHandle, agentByTerminalId } = options

  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
  const tasks = db.db
    .prepare(
      `SELECT id, run_id, parent_id, task_title, display_name, spec, status
       FROM tasks
       WHERE run_id = ?
       ORDER BY created_at ASC`
    )
    .all(runId) as TaskPartial[]

  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
  const dispatches = db.db
    .prepare(
      `SELECT id, run_id, task_id, assignee_handle, assignee_orca_session_id,
              creator_dispatch_id, creator_handle, depth, status
       FROM dispatch_contexts
       WHERE run_id = ?
       ORDER BY rowid ASC`
    )
    .all(runId) as DispatchPartial[]

  const creatorDispatchIds = new Set<string>()
  for (const d of dispatches) {
    if (d.creator_dispatch_id) {
      creatorDispatchIds.add(d.creator_dispatch_id)
    }
  }

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

  const dispatchesByTaskId = new Map<string, DispatchPartial[]>()
  for (const d of dispatches) {
    const list = dispatchesByTaskId.get(d.task_id) ?? []
    list.push(d)
    dispatchesByTaskId.set(d.task_id, list)
  }

  const nodeByDispatchId = new Map<string, OrchestrationNode>()
  const nodeByTaskId = new Map<string, OrchestrationNode>()

  const nodes: OrchestrationNode[] = []
  const edges: OrchestrationEdge[] = []
  const attentionItems: OrchestrationAttentionItem[] = []

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
    const cli = resolveCli(handle, task.spec, agentByTerminalId)

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

    let parentId = rootNodeId
    if (dispatch?.creator_dispatch_id && nodeByDispatchId.has(dispatch.creator_dispatch_id)) {
      parentId = nodeByDispatchId.get(dispatch.creator_dispatch_id)!.id
    } else if (task.parent_id && nodeByTaskId.has(task.parent_id)) {
      parentId = nodeByTaskId.get(task.parent_id)!.id
    }

    const attention = deriveAttention(nodeId, state, task.spec, task.task_title)
    if (attention) {
      attentionItems.push(attention)
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
      depth: dispatch?.depth ?? (parentId === rootNodeId ? 1 : 2),
      attention
    }

    nodes.push(node)
    edges.push({ from: parentId, to: nodeId })

    if (dispatch) {
      nodeByDispatchId.set(dispatch.id, node)
    }
    nodeByTaskId.set(task.id, node)
  }

  return {
    nodes,
    edges,
    attentionItems,
    taskCount: tasks.length
  }
}
