# Observation lifecycle

The selected Root Orchestrator defines the view's observation scope across workspace changes.
The view releases expensive observation resources when it closes, while accepted Interventions retain progress independently.
The plugin loads historical attempts progressively and reports display limits explicitly to prevent silent loss of agents.
