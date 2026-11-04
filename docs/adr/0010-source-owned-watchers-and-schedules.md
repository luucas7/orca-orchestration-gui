# Source-owned Watchers and schedules

The orchestration view exposes native Orca automations and watch-codex periodic triggers through source adapters, with explicit links to the selected orchestration.
The view requests Automated Watcher creation through an adapter, which binds the target and reports execution outcomes.
The source owns Watcher execution and scheduling independently of the graph's visibility or availability.
The graph shows source-provided deadlines and timestamps rather than inferred executions or a duplicate scheduler.
