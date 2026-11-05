import type { OrchestrationDb } from '../../runtime/orchestration/db'
import type {
  OrchestrationEdge,
  OrchestrationNode
} from '../../../shared/plugins/workers/plugin-host-api-orchestration'
import { deriveAttention } from './orchestration-graph-attention'
import { getSurveillanceLinksForRun } from '../../runtime/orchestration/surveillance/orchestration-surveillance-store'

export type WatcherNodesProjectionOptions = {
  db: OrchestrationDb
  runId: string
  rootNodeId: string
  existingNodes: readonly OrchestrationNode[]
  terminalTitleByHandle: ReadonlyMap<string, string>
  agentByTerminalId: ReadonlyMap<string, { agent: string | null; state: string }>
}

export type WatcherNodesProjectionResult = {
  watcherNodes: OrchestrationNode[]
  surveillanceEdges: OrchestrationEdge[]
}

export function projectWatcherNodesAndEdges(
  options: WatcherNodesProjectionOptions
): WatcherNodesProjectionResult {
  const { db, runId, rootNodeId, existingNodes, terminalTitleByHandle, agentByTerminalId } = options

  const links = getSurveillanceLinksForRun(db, runId)
  if (links.length === 0) {
    return { watcherNodes: [], surveillanceEdges: [] }
  }

  const nodesById = new Map<string, OrchestrationNode>()
  const nodesByDispatchId = new Map<string, OrchestrationNode>()
  const nodesByTaskId = new Map<string, OrchestrationNode>()

  for (const n of existingNodes) {
    nodesById.set(n.id, n)
    if (n.dispatchId) {
      nodesByDispatchId.set(n.dispatchId, n)
    }
    if (n.taskId) {
      nodesByTaskId.set(n.taskId, n)
    }
  }

  const watcherNodes: OrchestrationNode[] = []
  const surveillanceEdges: OrchestrationEdge[] = []
  const createdWatcherNodeIds = new Set<string>()

  for (const link of links) {
    // 1. Resolve target node in the scoped graph
    let targetNode: OrchestrationNode | undefined
    if (link.targetNodeId && nodesById.has(link.targetNodeId)) {
      targetNode = nodesById.get(link.targetNodeId)
    } else if (link.targetDispatchId && nodesByDispatchId.has(link.targetDispatchId)) {
      targetNode = nodesByDispatchId.get(link.targetDispatchId)
    } else if (link.targetTaskId && nodesByTaskId.has(link.targetTaskId)) {
      targetNode = nodesByTaskId.get(link.targetTaskId)
    } else if (
      link.targetNodeId === rootNodeId ||
      (!link.targetNodeId && !link.targetDispatchId && !link.targetTaskId)
    ) {
      targetNode = nodesById.get(rootNodeId)
    }

    if (!targetNode) {
      // If target node does not exist in this scope, skip
      continue
    }

    // 2. Build or resolve watcher node
    const watcherNodeId = link.watcherHandle
      ? `node:watcher:${link.watcherHandle}`
      : `node:watcher:${link.id}`

    if (!createdWatcherNodeIds.has(watcherNodeId)) {
      createdWatcherNodeIds.add(watcherNodeId)

      const terminalTitle = link.watcherHandle
        ? terminalTitleByHandle.get(link.watcherHandle)
        : null
      const liveAgent = link.watcherHandle ? agentByTerminalId.get(link.watcherHandle) : undefined

      const name = terminalTitle ?? link.watcherName
      const cli = liveAgent?.agent ?? link.watcherCli
      const state = liveAgent?.state ?? 'idle'
      const shortTaskTitle = `Observing ${targetNode.name}`

      const attention = deriveAttention(watcherNodeId, state, link.watcherName, 'Watcher')

      const watcherNode: OrchestrationNode = {
        id: watcherNodeId,
        name,
        cli,
        role: 'watcher',
        shortTaskTitle,
        state,
        taskId: null,
        dispatchId: null,
        terminalHandle: link.watcherHandle,
        orcaSessionId: link.watcherOrcaSessionId,
        parentId: null,
        depth: targetNode.depth,
        attention
      }

      watcherNodes.push(watcherNode)
    }

    // 3. Add Surveillance Edge
    surveillanceEdges.push({
      from: watcherNodeId,
      to: targetNode.id,
      linkType: 'surveillance'
    })
  }

  return { watcherNodes, surveillanceEdges }
}
