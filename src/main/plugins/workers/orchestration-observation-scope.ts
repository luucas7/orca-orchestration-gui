import type { ScopedOrchestrationGraph } from '../../../shared/plugins/workers/plugin-host-api-orchestration'

export type ObservationScopeState = {
  rootRunId: string
  lastSnapshot: ScopedOrchestrationGraph | null
  lastReadAt: number
  inFlightRead: Promise<ScopedOrchestrationGraph> | null
  invalidated: boolean
}

/**
 * Manages scoped observation lifecycles, coalescing event storms, and bounding concurrent reads
 * within a selected orchestration root.
 */
export class OrchestrationObservationManager {
  private readonly scopes = new Map<string, ObservationScopeState>()
  private readCount = 0

  /** Returns the total count of executed source reads (for deterministic testing). */
  getReadCount(): number {
    return this.readCount
  }

  /** Resets read count tracker. */
  resetReadCount(): void {
    this.readCount = 0
  }

  /**
   * Executes or coalesces a scoped graph read for a specific root run.
   * If a read for this root is already in flight, concurrent callers share the same promise.
   */
  async executeBoundedRead(
    rootRunId: string,
    reader: () => Promise<ScopedOrchestrationGraph>
  ): Promise<ScopedOrchestrationGraph> {
    let scope = this.scopes.get(rootRunId)
    if (!scope) {
      scope = {
        rootRunId,
        lastSnapshot: null,
        lastReadAt: 0,
        inFlightRead: null,
        invalidated: false
      }
      this.scopes.set(rootRunId, scope)
    }

    // Coalesce concurrent reads within the selected scope
    if (scope.inFlightRead) {
      return scope.inFlightRead
    }

    this.readCount++
    scope.invalidated = false
    const promise = reader()
      .then((snapshot) => {
        scope.lastSnapshot = snapshot
        scope.lastReadAt = Date.now()
        scope.inFlightRead = null
        return snapshot
      })
      .catch((err) => {
        scope.inFlightRead = null
        throw err
      })

    scope.inFlightRead = promise
    return promise
  }

  /** Marks a scope invalidated when an event arrives. */
  invalidate(rootRunId: string): void {
    const scope = this.scopes.get(rootRunId)
    if (scope) {
      scope.invalidated = true
    }
  }

  /** Returns the last cached snapshot for a root run if present. */
  getLastSnapshot(rootRunId: string): ScopedOrchestrationGraph | null {
    return this.scopes.get(rootRunId)?.lastSnapshot ?? null
  }

  /** Releases observation resources for a closed graph or disposed view. */
  releaseScope(rootRunId: string): void {
    this.scopes.delete(rootRunId)
  }

  /** Releases all active observation scopes (e.g. host shutdown or plugin deactivation). */
  dispose(): void {
    this.scopes.clear()
    this.readCount = 0
  }
}

export const globalObservationManager = new OrchestrationObservationManager()
