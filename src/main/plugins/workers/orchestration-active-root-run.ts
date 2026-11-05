import type { OrchestrationDb } from '../../runtime/orchestration/db'
import type { PluginWorkspaceTerminal } from './plugin-workspace-projection'

export type OrchestrationRunRow = {
  id: string
  objective: string
  coordinator_handle: string | null
  coordinator_orca_session_id: string | null
  created_at: string
}

function findRunIdByAssigneeHandle(
  db: OrchestrationDb,
  handle: string,
  runs: readonly OrchestrationRunRow[]
): string | null {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: SQLite query returns row or undefined
  const dispatchRow = db.db
    .prepare(
      `SELECT run_id FROM dispatch_contexts
       WHERE assignee_handle = ? AND status IN ('pending', 'dispatched')
       ORDER BY rowid DESC LIMIT 1`
    )
    .get(handle) as { run_id: string } | undefined
  return dispatchRow && runs.some((r) => r.id === dispatchRow.run_id) ? dispatchRow.run_id : null
}

export function resolveActiveRootRunId(
  db: OrchestrationDb,
  runs: readonly OrchestrationRunRow[],
  params?: { rootRunId?: string; rootHandle?: string },
  terminals: readonly PluginWorkspaceTerminal[] = []
): { activeRootRunId: string | null; selectedRootRunId: string | null } {
  let activeRootRunId: string | null = null

  if (params?.rootHandle) {
    const directRun = runs.find((r) => r.coordinator_handle === params.rootHandle)
    activeRootRunId = directRun?.id ?? findRunIdByAssigneeHandle(db, params.rootHandle, runs)
  }

  if (!activeRootRunId) {
    for (const t of terminals) {
      const match = runs.find((r) => r.coordinator_handle === t.id)
      const runId = match?.id ?? findRunIdByAssigneeHandle(db, t.id, runs)
      if (runId) {
        activeRootRunId = runId
        break
      }
    }
  }

  if (!activeRootRunId && runs.length > 0) {
    activeRootRunId = runs[0].id
  }

  const selectedRootRunId = params?.rootRunId ?? activeRootRunId ?? runs[0]?.id ?? null

  return { activeRootRunId, selectedRootRunId }
}
