# Declared orchestration relationships

The orchestration view uses relationships that Orca knows and includes the known descendants of the selected root Orchestrator.
A Watcher relationship requires an explicit declaration from a user or an agent through Orca.
The view does not infer supervision from message traffic.
The view also includes Watchers explicitly linked to agents in scope.
Other orchestrations that those Watchers monitor remain outside this scope.
This favors traceable relationships over automatic discovery.
