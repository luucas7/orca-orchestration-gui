# Durable Intervention progress

The integration layer records confirmed stop, launch, and notification outcomes independently of the plugin renderer's lifetime.
After a failure, the orchestration view recovers those outcomes and resumes only the necessary step, with explicit uncertainty where proof is absent.
The runtime rejects an Intervention when its selected execution no longer matches the current target, rather than applying it to a replacement execution.
