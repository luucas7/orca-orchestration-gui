# luucycle Roster

Current worker facts. Each Agent ID appears once.

## Agents

### codex:gpt-6.1-sol

- CLI: `Codex`
- Orca Agent: `codex`
- Command: `codex`
- Invocation: `exec`
- Model: `gpt-6.1-sol`
- Model Flag: `--model {model}`
- Bypass Flag: `--approve-for-me`
- Cost: `medium`
- Enabled: `true`
- Verified: `2026-11-04; codex --help and ~/.codex/models_cache.json; Orca 1.4.229 worker-start --help`

### codex:gpt-6-luna

- CLI: `Codex`
- Orca Agent: `codex`
- Command: `codex`
- Invocation: `exec`
- Model: `gpt-6-luna`
- Model Flag: `--model {model}`
- Bypass Flag: `--approve-for-me`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-04; codex --help and ~/.codex/models_cache.json; Orca 1.4.229 worker-start --help`

### agy:gemini-3.8-flash-high

- CLI: `Antigravity`
- Orca Agent: `antigravity`
- Command: `agy`
- Invocation: `--print`
- Model: `gemini-3.8-flash-high`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `high`
- Enabled: `true`
- Verified: `2026-11-03; agy --help and agy models`

### agy:gemini-3.8-flash-medium

- CLI: `Antigravity`
- Orca Agent: `antigravity`
- Command: `agy`
- Invocation: `--print`
- Model: `gemini-3.8-flash-medium`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `medium`
- Enabled: `true`
- Verified: `2026-11-03; agy --help and agy models`

### agy:gemini-3.8-flash-low

- CLI: `Antigravity`
- Orca Agent: `antigravity`
- Command: `agy`
- Invocation: `--print`
- Model: `gemini-3.8-flash-low`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-03; agy --help and agy models`

### agy:claude-opus-4-6-thinking

- CLI: `Antigravity`
- Orca Agent: `antigravity`
- Command: `agy`
- Invocation: `--print`
- Model: `claude-opus-4-6-thinking`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `high`
- Enabled: `true`
- Verified: `2026-11-03; agy --help and agy models`

### agy:claude-sonnet-4-6

- CLI: `Antigravity`
- Orca Agent: `antigravity`
- Command: `agy`
- Invocation: `--print`
- Model: `claude-sonnet-4-6`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `medium`
- Enabled: `true`
- Verified: `2026-11-03; agy --help and agy models`

### opencode:nemotron-3-ultra-free

- CLI: `OpenCode`
- Orca Agent: `opencode2`
- Command: `opencode2`
- Invocation: `run`
- Model: `opencode/nemotron-3-ultra-free`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto`
- Cost: `high`
- Enabled: `false`
- Verified: `2026-11-04; opencode2 models omits it and a free run probe returned provider.invalid-request: Model is unavailable`

### opencode:mimo-v2.6-flash-free

- CLI: `OpenCode`
- Orca Agent: `opencode2`
- Command: `opencode2`
- Invocation: `run`
- Model: `opencode/mimo-v2.6-flash-free`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto`
- Cost: `medium`
- Enabled: `true`
- Verified: `2026-11-04; opencode2 --help and live opencode2 models; Orca 1.4.229 worker-start --help`

### opencode:nemotron-3.5-lightning-free

- CLI: `OpenCode`
- Orca Agent: `opencode2`
- Command: `opencode2`
- Invocation: `run`
- Model: `opencode/nemotron-3.5-lightning-free`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-04; opencode2 --help and live opencode2 models; Orca 1.4.229 worker-start --help`

### cline:mimo-v2.6-flash

- CLI: `Cline`
- Command: `cline`
- Invocation: `none - direct prompt`
- Model: `cline-free/mimo-v2.6-flash`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto-approve true`
- Cost: `low`
- Enabled: `false`
- Verified: `2026-11-04; Orca worker-start help exposes no cline launch alias, so the worker cannot be dispatched`

### claude:claude-opus-4-6-thinking

- CLI: `Claude`
- Orca Agent: `claude`
- Command: `claude`
- Invocation: `--print`
- Model: `claude-opus-4-6-thinking`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `high`
- Enabled: `true`
- Verified: `2026-11-04; claude --help; Orca 1.4.229 worker-start --help`

### claude:claude-sonnet-4-6

- CLI: `Claude`
- Orca Agent: `claude`
- Command: `claude`
- Invocation: `--print`
- Model: `claude-sonnet-4-6`
- Model Flag: `--model {model}`
- Bypass Flag: `--dangerously-skip-permissions`
- Cost: `medium`
- Enabled: `true`
- Verified: `2026-11-04; claude --help; Orca 1.4.229 worker-start --help`

### copilot:auto-default

- CLI: `GitHub Copilot`
- Orca Agent: `copilot`
- Command: `copilot`
- Invocation: `-p`
- Model: `auto-default`
- Model Flag: `none - default model`
- Bypass Flag: `--allow-all`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-04; copilot --help and copilot -p`

### opencode:deepseek-v4.1-flash-free

- CLI: `OpenCode`
- Orca Agent: `opencode2`
- Command: `opencode2`
- Invocation: `run`
- Model: `opencode/deepseek-v4.1-flash-free`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-04; opencode2 --help and live opencode2 models; Orca 1.4.229 worker-start --help`

### opencode:glm-5.3-flash-free

- CLI: `OpenCode`
- Orca Agent: `opencode2`
- Command: `opencode2`
- Invocation: `run`
- Model: `opencode/glm-5.3-flash-free`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-04; opencode2 --help and live opencode2 models; Orca 1.4.229 worker-start --help`

### opencode:crouton-alpha-free

- CLI: `OpenCode`
- Orca Agent: `opencode2`
- Command: `opencode2`
- Invocation: `run`
- Model: `opencode/crouton-alpha-free`
- Model Flag: `--model {model}`
- Bypass Flag: `--auto`
- Cost: `low`
- Enabled: `true`
- Verified: `2026-11-04; opencode2 --help and live opencode2 models; Orca 1.4.229 worker-start --help`
