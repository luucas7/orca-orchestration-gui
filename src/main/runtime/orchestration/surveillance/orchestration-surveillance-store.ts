import { randomUUID } from 'node:crypto'
import type { OrchestrationDb } from '../db'
import type {
  OrchestrationDeclareSurveillanceLinkParams,
  SurveillanceLink
} from '../../../../shared/plugins/workers/plugin-host-api-orchestration'
import { PluginHostCallError } from '../../../plugins/workers/plugin-host-call-scope'

type SurveillanceLinkRow = {
  id: string
  watcher_handle: string | null
  watcher_orca_session_id: string | null
  watcher_name: string
  watcher_cli: string
  target_run_id: string
  target_node_id: string | null
  target_task_id: string | null
  target_dispatch_id: string | null
  declared_by: string
  created_at: string
}

function mapRow(row: SurveillanceLinkRow): SurveillanceLink {
  return {
    id: row.id,
    watcherHandle: row.watcher_handle,
    watcherOrcaSessionId: row.watcher_orca_session_id,
    watcherName: row.watcher_name,
    watcherCli: row.watcher_cli,
    targetRunId: row.target_run_id,
    targetNodeId: row.target_node_id,
    targetTaskId: row.target_task_id,
    targetDispatchId: row.target_dispatch_id,
    declaredBy: row.declared_by,
    createdAt: row.created_at
  }
}

export function insertSurveillanceLink(
  db: OrchestrationDb,
  params: OrchestrationDeclareSurveillanceLinkParams
): SurveillanceLink {
  if (!params.watcherName || params.watcherName.trim().length === 0) {
    throw new PluginHostCallError('invalid_params', 'watcherName is required')
  }
  if (!params.declaredBy || params.declaredBy.trim().length === 0) {
    throw new PluginHostCallError('invalid_params', 'declaredBy is required')
  }

  // 1. Verify target run
  const runRow = db.db.prepare('SELECT id FROM runs WHERE id = ?').get(params.targetRunId)
  if (!runRow) {
    throw new PluginHostCallError('invalid_params', `target run not found: ${params.targetRunId}`)
  }

  // 2. Verify target task if specified
  if (params.targetTaskId) {
    const taskRow = db.db
      .prepare('SELECT id FROM tasks WHERE id = ? AND run_id = ?')
      .get(params.targetTaskId, params.targetRunId)
    if (!taskRow) {
      throw new PluginHostCallError(
        'invalid_params',
        `target task not found in run: ${params.targetTaskId}`
      )
    }
  }

  // 3. Verify target dispatch if specified
  if (params.targetDispatchId) {
    const dispatchRow = db.db
      .prepare('SELECT id FROM dispatch_contexts WHERE id = ? AND run_id = ?')
      .get(params.targetDispatchId, params.targetRunId)
    if (!dispatchRow) {
      throw new PluginHostCallError(
        'invalid_params',
        `target dispatch not found in run: ${params.targetDispatchId}`
      )
    }
  }

  // 4. Verify target node if specified
  if (params.targetNodeId) {
    if (params.targetNodeId.startsWith('root:')) {
      if (params.targetNodeId !== `root:${params.targetRunId}`) {
        throw new PluginHostCallError(
          'invalid_params',
          `target root node mismatch: ${params.targetNodeId}`
        )
      }
    } else if (params.targetNodeId.startsWith('node:task:')) {
      const taskId = params.targetNodeId.replace('node:task:', '')
      const taskRow = db.db
        .prepare('SELECT id FROM tasks WHERE id = ? AND run_id = ?')
        .get(taskId, params.targetRunId)
      if (!taskRow) {
        throw new PluginHostCallError(
          'invalid_params',
          `target task node not found in run: ${params.targetNodeId}`
        )
      }
    } else if (params.targetNodeId.startsWith('node:dispatch:')) {
      const dispatchId = params.targetNodeId.replace('node:dispatch:', '')
      const dispatchRow = db.db
        .prepare('SELECT id FROM dispatch_contexts WHERE id = ? AND run_id = ?')
        .get(dispatchId, params.targetRunId)
      if (!dispatchRow) {
        throw new PluginHostCallError(
          'invalid_params',
          `target dispatch node not found in run: ${params.targetNodeId}`
        )
      }
    }
  }

  const id = `surv-${randomUUID()}`
  const createdAt = new Date().toISOString()
  const watcherHandle = params.watcherHandle ?? null
  const watcherOrcaSessionId = params.watcherOrcaSessionId ?? null
  const targetNodeId = params.targetNodeId ?? null
  const targetTaskId = params.targetTaskId ?? null
  const targetDispatchId = params.targetDispatchId ?? null

  db.db
    .prepare(
      `INSERT INTO surveillance_links (
        id, watcher_handle, watcher_orca_session_id, watcher_name, watcher_cli,
        target_run_id, target_node_id, target_task_id, target_dispatch_id,
        declared_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      watcherHandle,
      watcherOrcaSessionId,
      params.watcherName,
      params.watcherCli,
      params.targetRunId,
      targetNodeId,
      targetTaskId,
      targetDispatchId,
      params.declaredBy,
      createdAt
    )

  return {
    id,
    watcherHandle,
    watcherOrcaSessionId,
    watcherName: params.watcherName,
    watcherCli: params.watcherCli,
    targetRunId: params.targetRunId,
    targetNodeId,
    targetTaskId,
    targetDispatchId,
    declaredBy: params.declaredBy,
    createdAt
  }
}

export function getSurveillanceLinksForRun(
  db: OrchestrationDb,
  targetRunId: string
): SurveillanceLink[] {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row objects
  const rows = db.db
    .prepare(
      `SELECT id, watcher_handle, watcher_orca_session_id, watcher_name, watcher_cli,
              target_run_id, target_node_id, target_task_id, target_dispatch_id,
              declared_by, created_at
       FROM surveillance_links
       WHERE target_run_id = ?
       ORDER BY created_at ASC`
    )
    .all(targetRunId) as SurveillanceLinkRow[]

  return rows.map(mapRow)
}
