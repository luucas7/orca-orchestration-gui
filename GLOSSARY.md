# Orca

Orca coordinates agents and provides access to their workspaces and terminals.

## Language

**Run**:
A durable Orca orchestration namespace with an inbox for its coordinator.
_Avoid_: AutomationRun (an occurrence of a scheduled automation).

**Orchestration view**:
A graphical view of the agents, Watchers, and Scheduled triggers explicitly associated with one Orca orchestration.

**Task**:
A durable work item in an Orca Run, with a specification, dependencies, and a status.

**Dispatch**:
One attempt to execute a Task. A replacement CLI executes a new Dispatch of the same Task.
_Avoid_: Task (the work persists across attempts), terminal (the execution surface).

**Orchestrator**:
An agent that delegates work to other agents and supervises that work. An Orchestrator can also work under another Orchestrator.

**Root Orchestrator**:
The Orchestrator selected as the entry point for an orchestration view. Its known descendants define the delegation scope of that view.

**Watcher**:
A supervisor with an explicitly declared target. A Watcher can be an agent or an automated program.

**Automated Watcher**:
A program that checks its target periodically and performs actions according to its configuration, such as watch-codex.

**Scheduled trigger**:
A declared cadence or schedule for an automation or an Automated Watcher. A Scheduled trigger does not prove that an occurrence executed.
_Avoid_: Cron (some sources use an interval loop rather than a cron scheduler).

**Automation**:
A native Orca definition that schedules agent prompts.

**AutomationRun**:
One occurrence of an Automation, separate from an orchestration Run.

**Human pause**:
An explicit user intent that suspends automatic relaunch of one target until an explicit resume.

**Delegation link**:
A relationship from an Orchestrator to an agent whose work it supervises.

**Surveillance link**:
An explicitly declared relationship from a Watcher to the agent it monitors.
_Avoid_: Delegation link (surveillance does not imply responsibility for the target's work).

**Intervention**:
A user action that changes an orchestration or sends an instruction to one of its agents, with explicit human attribution.

**Replacement context**:
The Task specification, workspace, available results, and optional user note that support a new Dispatch with a different CLI.
_Avoid_: Conversation transfer (the replacement does not inherit the complete conversation).
