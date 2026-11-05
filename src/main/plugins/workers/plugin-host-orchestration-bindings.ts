import { PLUGIN_HOST_API } from '../../../shared/plugins/workers/plugin-host-api'
import { bind, type BoundPluginHostMethod } from './plugin-host-method-bind'
import { PluginHostCallError } from './plugin-host-call-scope'
import { projectScopedOrchestrationGraph } from './orchestration-graph-projection'
import { globalObservationManager } from './orchestration-observation-scope'
import { insertSurveillanceLink } from '../../runtime/orchestration/surveillance/orchestration-surveillance-store'

const api = PLUGIN_HOST_API

export const PLUGIN_ORCHESTRATION_HANDLERS: {
  'orchestration.getScopedGraph': BoundPluginHostMethod
  'orchestration.navigateTerminal': BoundPluginHostMethod
  'orchestration.declareSurveillanceLink': BoundPluginHostMethod
} = {
  'orchestration.getScopedGraph': bind(
    api['orchestration.getScopedGraph'],
    async (params, { services }) => {
      const db = services.orchestration?.getOrchestrationDb() ?? null
      const scopeKey = params?.rootRunId ?? params?.rootHandle ?? 'active'

      return globalObservationManager.executeBoundedRead(scopeKey, async () => {
        const context = await services.resolveActiveWorktreeContext()
        const terminals = context ? await services.listWorktreeTerminals(context.worktreeId) : []
        const agentStatuses = services.listAgentStatuses()

        return projectScopedOrchestrationGraph({
          db,
          params,
          terminals,
          agentStatuses
        })
      })
    }
  ),
  'orchestration.navigateTerminal': bind(
    api['orchestration.navigateTerminal'],
    async (params, { services, scope }) => {
      scope.assertActive()
      if (!services.runtimeRpc) {
        throw new PluginHostCallError('unavailable', 'this Orca host cannot navigate terminals')
      }
      type TerminalFocusAnswer = {
        focus?: {
          handle?: string
          tabId?: string | null
          worktreeId?: string | null
          navigated?: boolean
        }
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: runtimeRpc terminal.focus returns focus envelope or undefined
      const answer = (await services.runtimeRpc('terminal.focus', {
        terminal: params.terminalHandle,
        navigation: 'host'
      })) as TerminalFocusAnswer | undefined

      return {
        navigated: Boolean(answer?.focus?.navigated),
        tabId: answer?.focus?.tabId ?? null,
        worktreeId: answer?.focus?.worktreeId ?? null
      }
    }
  ),
  'orchestration.declareSurveillanceLink': bind(
    api['orchestration.declareSurveillanceLink'],
    async (params, { services, scope }) => {
      scope.assertActive()
      const db = services.orchestration?.getOrchestrationDb() ?? null
      if (!db) {
        throw new PluginHostCallError('unavailable', 'orchestration database is not available')
      }
      const link = insertSurveillanceLink(db, params)
      return {
        declared: true,
        link
      }
    }
  )
}
