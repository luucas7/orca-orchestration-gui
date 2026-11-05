import type {
  OrchestrationAttentionCause,
  OrchestrationAttentionItem
} from '../../../shared/plugins/workers/plugin-host-api-orchestration'

export function deriveAttention(
  nodeId: string,
  state: string,
  specText: string,
  taskTitle: string | null
): OrchestrationAttentionItem | null {
  const s = state.toLowerCase()
  const lowerText = `${specText} ${taskTitle ?? ''}`.toLowerCase()

  // Heuristic watcher observations are NEVER confirmed Orca facts -> always Uncertain
  if (s.includes('heuristic') || s === 'unconfirmed' || lowerText.includes('heuristic')) {
    return {
      id: `attn:${nodeId}`,
      nodeId,
      category: 'uncertain',
      reason: 'Heuristic observation unconfirmed by Orca runtime',
      cause: 'unconfirmed-heuristic',
      isHeuristic: true,
      source: 'watcher-heuristic',
      timestamp: new Date().toISOString()
    }
  }

  // Idle / standby activity does NOT imply failure or require attention
  if (s === 'idle' || lowerText.includes('standby') || lowerText.includes('idle')) {
    return null
  }

  // 1. Confirmed Failure:
  // Must have concrete failure state (failed, error, crashed)
  if (s === 'failed' || s === 'error' || s === 'crashed') {
    let cause: OrchestrationAttentionCause = 'native-failure'
    let reason = 'Native process failure'

    if (lowerText.includes('quota')) {
      cause = 'quota-exceeded'
      reason = 'API rate limit or quota exceeded'
    } else if (lowerText.includes('context') || lowerText.includes('token limit')) {
      cause = 'context-window-exhausted'
      reason = 'Context window limit exceeded'
    } else if (lowerText.includes('budget')) {
      cause = 'budget-exceeded'
      reason = 'Task budget exceeded'
    } else {
      cause = 'native-failure'
      reason = 'Task process exited with failure'
    }

    return {
      id: `attn:${nodeId}`,
      nodeId,
      category: 'confirmed-failure',
      reason,
      cause,
      isHeuristic: false,
      source: 'orca-runtime',
      timestamp: new Date().toISOString()
    }
  }

  // 2. Expected Intervention:
  // e.g. waiting for input or blocked by approval
  if (s === 'waiting' || s === 'blocked' || s === 'needs-input') {
    return {
      id: `attn:${nodeId}`,
      nodeId,
      category: 'expected-intervention',
      reason: 'Awaiting human intervention or input',
      cause: 'input-required',
      isHeuristic: false,
      source: 'orca-runtime',
      timestamp: new Date().toISOString()
    }
  }

  // Idle or running activity does NOT imply failure
  return null
}

export function createSourceDisconnectAttentionItem(
  runId: string,
  rootNodeId: string
): OrchestrationAttentionItem {
  return {
    id: `attn:source-disconnect:${runId}`,
    nodeId: rootNodeId,
    category: 'uncertain',
    reason: 'Source disconnected; telemetry unverified',
    cause: 'source-disconnect',
    isHeuristic: false,
    source: 'source-telemetry',
    timestamp: new Date().toISOString()
  }
}
