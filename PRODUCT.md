# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are software developers, power-users, and "100x builders" managing multiple AI coding agents (Codex, Claude Code, OpenCode, Pi, Antigravity) simultaneously on complex codebases.

They work across parallel Git worktrees, terminal splits, and remote SSH environments where context switching between separate tools, web transcripts, and disjointed review workflows slows delivery down.

## Product Purpose

Orca is an AI orchestrator and developer environment that unites multi-agent execution, terminal multiplexing, diff review, and workspace management into one unified desktop application.

Success means developers can fan out prompts across multiple agents in isolated worktrees, evaluate and compare solutions side-by-side, inspect visual changes, and merge winning implementations without context switching or window sprawl.

## Positioning

Unlike standalone chat interfaces or single-agent IDE extensions, Orca is built from the ground up for a fleet of autonomous and semi-autonomous coding agents. It provides native Git worktree isolation per prompt, Ghostty-class WebGL split terminals, native PR/Linear issue management, an embedded browser with "Design Mode" (inspect DOM/CSS and pipe cropped screenshots into agent prompts), and a mobile companion for remote supervision.

## Operating Context

- Desktop application (Electron on macOS, Windows, Linux) pairing with an optional mobile companion (iOS, Android).
- Developers operate with local or remote git repositories, terminal commands, and multi-CLI agent configurations (`codex`, `claude`, `opencode2`, `agy`, `cline`).
- Multi-worktree workflows where multiple agent processes run concurrently on distinct worktree branches.
- Remote SSH runtime execution for resource-intensive builds and containerless isolated dev profiles (`orca-dev`).

## Capabilities and Constraints

- **Parallel Worktrees**: Run multiple agents in isolated Git worktrees concurrently.
- **Terminal Splits**: Hardware-accelerated WebGL terminals with persistent sessions and infinite splits.
- **Design Mode**: Direct element selection in Chromium webview with DOM/CSS and screenshot injection into prompts.
- **Native Task Integration**: GitHub Issues & PRs and Linear project tracking directly within the application.
- **Diff & Code Review**: Inline AI diff annotations, review comments sent back to agents.
- **UI Constraint**: Monochrome and quiet identity framing (neutral grays, Geist sans, shadcn primitives). Color is strictly reserved for state (selection ring, destructive actions, git status).

## Brand Commitments

- Name: Orca (by Stably AI).
- Tone & Voice: Utilitarian, precise, high-performance, developer-focused, quiet.
- Visual Language: Governed by `docs/STYLEGUIDE.md` and tokens in `src/renderer/src/assets/main.css`. The chrome recedes behind terminals, editors, and diffs.

## Evidence on Hand

- Canonical style guide: [`docs/STYLEGUIDE.md`](docs/STYLEGUIDE.md) and deep-dive sub-specs in `docs/styleguide/`.
- Contributing guidelines: [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md).
- Architectural rules & CLI conventions: [`AGENTS.md`](AGENTS.md).
- Public documentation and feature wall: `README.md` and `docs/site/`.

## Product Principles

1. **Quiet, Receding Chrome**: The UI is a frame for agent output, code, and terminals; it never competes for attention.
2. **Worktree Isolation as Safety**: Every prompt can run in its own worktree; experimentation never damages the main working copy.
3. **Multi-Agent Neutrality**: First-class support for any provider or CLI agent without vendor lock-in.
4. **Performance & Zero Steal**: Hardware acceleration, background execution (`ORCA_BACKGROUND_LAUNCH=1`), and strict non-stealing window policies.
5. **Cross-Platform Parity**: macOS, Linux, and Windows are supported equally with runtime platform adaptation.
