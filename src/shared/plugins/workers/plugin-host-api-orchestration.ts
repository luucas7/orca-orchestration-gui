import { z } from 'zod'
import { ALL_SURFACES, FRAMES_ONLY, spec } from './plugin-host-method-spec'

export const ORCHESTRATION_NODE_ROLES = [
  'root-orchestrator',
  'orchestrator',
  'worker',
  'watcher'
] as const
export type OrchestrationNodeRole = (typeof ORCHESTRATION_NODE_ROLES)[number]

export const ORCHESTRATION_ATTENTION_CATEGORIES = [
  'confirmed-failure',
  'expected-intervention',
  'uncertain'
] as const
export type OrchestrationAttentionCategory = (typeof ORCHESTRATION_ATTENTION_CATEGORIES)[number]

export const ORCHESTRATION_ATTENTION_CAUSES = [
  'native-failure',
  'input-required',
  'quota-exceeded',
  'context-window-exhausted',
  'budget-exceeded',
  'source-disconnect',
  'stale-telemetry',
  'unconfirmed-heuristic',
  'unknown'
] as const
export type OrchestrationAttentionCause = (typeof ORCHESTRATION_ATTENTION_CAUSES)[number]

export const orchestrationAttentionItemSchema = z
  .object({
    id: z.string().min(1).max(512),
    nodeId: z.string().min(1).max(512),
    category: z.enum(ORCHESTRATION_ATTENTION_CATEGORIES),
    reason: z.string().max(512),
    cause: z.enum(ORCHESTRATION_ATTENTION_CAUSES),
    isHeuristic: z.boolean(),
    source: z.string().max(128),
    timestamp: z.string().max(128).optional()
  })
  .strict()
export type OrchestrationAttentionItem = z.infer<typeof orchestrationAttentionItemSchema>

export const orchestrationSourceFreshnessSchema = z
  .object({
    status: z.enum(['live', 'stale', 'disconnected']),
    lastUpdatedAt: z.string().max(128),
    provenance: z.string().max(256),
    isVerified: z.boolean()
  })
  .strict()
export type OrchestrationSourceFreshness = z.infer<typeof orchestrationSourceFreshnessSchema>

export const ORCHESTRATION_EMPTY_REASONS = [
  'no-runs',
  'run-not-found',
  'no-tasks',
  'disabled',
  'incompatible-host'
] as const
export type OrchestrationEmptyReason = (typeof ORCHESTRATION_EMPTY_REASONS)[number]

export const orchestrationRootSummarySchema = z
  .object({
    runId: z.string().min(1).max(512),
    objective: z.string().max(2048),
    coordinatorHandle: z.string().max(1024).nullable(),
    coordinatorOrcaSessionId: z.string().max(256).nullable(),
    createdAt: z.string().max(128),
    status: z.string().max(64)
  })
  .strict()
export type OrchestrationRootSummary = z.infer<typeof orchestrationRootSummarySchema>

export const orchestrationNodeSchema = z
  .object({
    id: z.string().min(1).max(512),
    name: z.string().max(512),
    cli: z.string().max(128),
    role: z.enum(ORCHESTRATION_NODE_ROLES),
    shortTaskTitle: z.string().max(512),
    state: z.string().max(64),
    taskId: z.string().max(512).nullable(),
    dispatchId: z.string().max(512).nullable(),
    terminalHandle: z.string().max(1024).nullable(),
    orcaSessionId: z.string().max(256).nullable(),
    parentId: z.string().max(512).nullable(),
    depth: z.number().int().nonnegative(),
    attention: orchestrationAttentionItemSchema.nullable().optional()
  })
  .strict()
export type OrchestrationNode = z.infer<typeof orchestrationNodeSchema>

export const ORCHESTRATION_LINK_TYPES = ['delegation', 'surveillance'] as const
export type OrchestrationLinkType = (typeof ORCHESTRATION_LINK_TYPES)[number]

export const orchestrationEdgeSchema = z
  .object({
    from: z.string().min(1).max(512),
    to: z.string().min(1).max(512),
    linkType: z.enum(ORCHESTRATION_LINK_TYPES).default('delegation')
  })
  .strict()
export type OrchestrationEdge = z.infer<typeof orchestrationEdgeSchema>

export const scopedOrchestrationGraphSchema = z
  .object({
    activeRootRunId: z.string().max(512).nullable(),
    selectedRootRunId: z.string().max(512).nullable(),
    roots: z.array(orchestrationRootSummarySchema).max(100),
    nodes: z.array(orchestrationNodeSchema).max(500),
    edges: z.array(orchestrationEdgeSchema).max(1000),
    emptyReason: z.enum(ORCHESTRATION_EMPTY_REASONS).nullable(),
    attentionItems: z.array(orchestrationAttentionItemSchema).max(500).default([]),
    attentionCount: z.number().int().nonnegative().default(0),
    sourceFreshness: orchestrationSourceFreshnessSchema.optional()
  })
  .strict()
export type ScopedOrchestrationGraph = z.infer<typeof scopedOrchestrationGraphSchema>

export const orchestrationGetScopedGraphParams = z
  .strictObject({
    rootRunId: z.string().min(1).max(512).optional(),
    rootHandle: z.string().min(1).max(1024).optional(),
    staleSource: z.boolean().optional()
  })
  .optional()

export const surveillanceLinkSchema = z
  .object({
    id: z.string().min(1).max(512),
    watcherHandle: z.string().max(1024).nullable(),
    watcherOrcaSessionId: z.string().max(256).nullable(),
    watcherName: z.string().max(512),
    watcherCli: z.string().max(128),
    targetRunId: z.string().max(512),
    targetNodeId: z.string().max(512).nullable(),
    targetTaskId: z.string().max(512).nullable(),
    targetDispatchId: z.string().max(512).nullable(),
    declaredBy: z.string().max(512),
    createdAt: z.string().max(128)
  })
  .strict()
export type SurveillanceLink = z.infer<typeof surveillanceLinkSchema>

export const orchestrationDeclareSurveillanceLinkParams = z.strictObject({
  watcherHandle: z.string().min(1).max(1024).nullable().optional(),
  watcherOrcaSessionId: z.string().min(1).max(256).nullable().optional(),
  watcherName: z.string().min(1).max(512),
  watcherCli: z.string().min(1).max(128),
  targetRunId: z.string().min(1).max(512),
  targetNodeId: z.string().min(1).max(512).nullable().optional(),
  targetTaskId: z.string().min(1).max(512).nullable().optional(),
  targetDispatchId: z.string().min(1).max(512).nullable().optional(),
  declaredBy: z.string().min(1).max(512)
})
export type OrchestrationDeclareSurveillanceLinkParams = z.infer<
  typeof orchestrationDeclareSurveillanceLinkParams
>

export const orchestrationDeclareSurveillanceLinkResult = z
  .object({
    declared: z.boolean(),
    link: surveillanceLinkSchema
  })
  .strict()
export type OrchestrationDeclareSurveillanceLinkResult = z.infer<
  typeof orchestrationDeclareSurveillanceLinkResult
>

export const orchestrationNavigateTerminalParams = z.strictObject({
  terminalHandle: z.string().min(1).max(1024)
})

export const orchestrationNavigateTerminalResult = z
  .object({
    navigated: z.boolean(),
    tabId: z.string().max(256).nullable(),
    worktreeId: z.string().max(1024).nullable()
  })
  .strict()

export const PLUGIN_ORCHESTRATION_HOST_API = {
  'orchestration.getScopedGraph': spec({
    summary:
      'Returns the scoped orchestration hierarchy for a selected or proposed Root Orchestrator.',
    since: 2,
    scope: 'active-workspace',
    capability: null,
    mutation: false,
    surfaces: ALL_SURFACES,
    params: orchestrationGetScopedGraphParams,
    result: scopedOrchestrationGraphSchema
  }),
  'orchestration.navigateTerminal': spec({
    summary:
      'Focuses the exact existing terminal session for an agent, restoring and revealing its pane without creating a duplicate PTY.',
    since: 2,
    scope: 'desktop',
    capability: null,
    mutation: true,
    surfaces: FRAMES_ONLY,
    params: orchestrationNavigateTerminalParams,
    result: orchestrationNavigateTerminalResult
  }),
  'orchestration.declareSurveillanceLink': spec({
    summary: 'Explicitly declares a Surveillance link from a Watcher to an agent it monitors.',
    since: 2,
    scope: 'active-workspace',
    capability: null,
    mutation: true,
    surfaces: ALL_SURFACES,
    params: orchestrationDeclareSurveillanceLinkParams,
    result: orchestrationDeclareSurveillanceLinkResult
  })
}
