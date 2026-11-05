# luucycle WARNINGS

Observed CLI/agent lessons, scoped to their evidence and context.

## OpenCode catalog can advertise an unavailable free model

- **Observation**: `opencode2 models` listed `opencode/nemotron-3-ultra-free`, but a free `opencode2 run --model opencode/nemotron-3-ultra-free` probe failed with `provider.invalid-request: Model is unavailable`.
- **Context**: OpenCode 2.1.4, Linux, 2026-11-04; the model still appeared in the local and models.dev catalogs.
- **Evidence**: probe session `ses_e5b5b315dffekuPJijuc1a8NFS`; roster entry `opencode:nemotron-3-ultra-free` disabled after the failure.
- **Cause**: unknown; the backend rejected the model while catalog metadata still advertised it.
- **Workaround and limits**: a catalog listing is not runtime availability. Confirm a free model with one minimal run before dispatch; this probe does not prove later availability.

## oxfmt markdown table alignment causes roster.py header mismatch

- **Observation**: Running formatting tools such as `oxfmt` on `.agents/luucycle/ROLES.md` automatically aligns table columns with padding spaces, causing `roster.py check` to fail with `ROLES.md is missing the canonical table header`.
- **Context**: `oxfmt` 0.1+, Linux, 2026-11-05.
- **Evidence**: `roster.py` checks exact string equality against `ROLES_HEADER = "| Role | When | Context to inject | Output format | Eligible agents (\`agent@fit\`, highest first) |"`.
- **Cause**: Markdown formatters pad column separators to match the longest row.
- **Workaround and limits**: Run `sed -i '3s/.*/| Role | When | Context to inject | Output format | Eligible agents (`agent@fit`, highest first) |/' .agents/luucycle/ROLES.md && sed -i '4s/.*/| --- | --- | --- | --- | --- |/' .agents/luucycle/ROLES.md` before invoking `doctor.py` or `roster.py`.
