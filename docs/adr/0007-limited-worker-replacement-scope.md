# Limited worker replacement scope

The first version replaces only workers whose exact execution the runtime can control and verify, with no active descendants.
Root Orchestrator replacement remains a separate recovery workflow because it also transfers coordination authority and inbox ownership.
A stop targets only the selected execution, with an explicit warning about active descendants and their unavailable supervisor.
Agents that lack the required control guarantees retain the navigation and messaging actions that the runtime supports.
