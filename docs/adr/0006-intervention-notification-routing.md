# Intervention notification routing

An Intervention notifies the affected agent's direct Orchestrator, with the Run inbox as the fallback when that Orchestrator is unavailable.
The Intervention remains visible from the Root Orchestrator's view.
Watchers receive human Intervention notifications about targets in their explicit Surveillance links, rather than a broadcast to every agent.
Their instructions or scripts remain responsible for error and quota monitoring.
