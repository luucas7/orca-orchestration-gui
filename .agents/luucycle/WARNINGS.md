# luucycle WARNINGS

Observed CLI/agent lessons, scoped to their evidence and context.

## OpenCode catalog can advertise an unavailable free model

- **Observation**: `opencode2 models` listed `opencode/nemotron-3-ultra-free`, but a free `opencode2 run --model opencode/nemotron-3-ultra-free` probe failed with `provider.invalid-request: Model is unavailable`.
- **Context**: OpenCode 2.1.4, Linux, 2026-11-04; the model still appeared in the local and models.dev catalogs.
- **Evidence**: probe session `ses_e5b5b315dffekuPJijuc1a8NFS`; roster entry `opencode:nemotron-3-ultra-free` disabled after the failure.
- **Cause**: unknown; the backend rejected the model while catalog metadata still advertised it.
- **Workaround and limits**: a catalog listing is not runtime availability. Confirm a free model with one minimal run before dispatch; this probe does not prove later availability.
