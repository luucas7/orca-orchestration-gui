# Targeted Watcher creation

The orchestration view creates Automated Watchers through a source adapter, with Codex as the first supported target provider.
Each instance has a stable identity and target, with at most one active Automated Watcher per target.
The source supports instance-specific pause, resume, and stop commands independently of the graph's lifecycle.
Restarts use Orca so that the target remains part of its orchestration, rather than an unrelated standalone process.
