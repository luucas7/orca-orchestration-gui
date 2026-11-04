# Isolated plugin with a versioned host interface

The orchestration view uses an HTML plugin panel in Orca's resizable right sidebar, with its renderer and graph calculations outside Orca's main renderer.
A small, versioned host interface supplies orchestration observations, navigation, and authorized Interventions through the runtime.
The runtime remains authoritative for Tasks and Dispatches, while the plugin owns view preferences.
This favors a few explicit integration points over changes throughout Orca when upstream evolves.
