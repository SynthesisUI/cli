# synthesisui

The CLI for [SynthesisUI](https://www.synthesisui.com) - where your design
system is born, scored against the classic design canon, and delivered to any
coding agent.

Your AI writes UI. This gives it a design system to write it in: tokens, typed
components, whole pages and a `CLAUDE.md` manifest that Claude Code, Cursor,
Copilot or any coding agent reads before writing a single line.

> This repository is a **read-only mirror** of `packages/cli` in the SynthesisUI
> monorepo, published so you can audit exactly what runs in your repo.
> Issues and bug reports are very welcome here; pull requests can't land on a
> mirror - open an issue instead.

## Quickstart

```bash
npx synthesisui@latest init --styles tailwind --ds <slug>
```

Pick any system from the [gallery](https://www.synthesisui.com) - or create
your own in two minutes.

## Commands

| Command | What it does |
| --- | --- |
| `init` | One-shot setup: materialize a system + wire your project for it |
| `login` | Connect to your account (device-flow in the browser) |
| `list` | List the design systems available to you |
| `add <slug>` | Materialize a system into `_synthesisui/ds/<slug>/` |
| `use <slug>` | Generate the agent prompt to apply the system to your app |
| `component <slug> <name>` | Bring one typed component into your components dir |
| `template <slug> <name>` | Generate a whole page (landing, dashboard, onboarding…) |
| `generate` | Generate a page from a saved guide structure |
| `advise` | Grounded design advice for this repo, from your system's rules |
| `refit <file>` | Send an app component back into your design system |
| `upgrade <slug>` | Diff your `.lock` against the latest version and migrate |
| `clean` | Remove materialized files and the managed CLAUDE.md block |

## What `add` materializes

Inside `_synthesisui/ds/<slug>/`:

- `design-system.json` - the canonical source of truth
- `tokens.css` - CSS custom properties scoped by `data-ds`
- `theme.css` - optional Tailwind v4 `@theme` adapter (`bg-primary`, `p-md`, …)
- `GUIDE.md` - agent instructions: semantic roles, mood, recipes
- `rules.md` - the governance your agent must follow
- `.lock` - pinned slug + version (reproducible upgrades)

Plus an idempotent `<!-- synthesisui:start/end -->` block in your root
`CLAUDE.md` listing every installed system and its component manifest.

## Authentication

`synthesisui login` uses device-flow (RFC 8628): it opens the browser, you
confirm a code, and the token lands in `~/.synthesisui/credentials.json`
(per machine, chmod 600). Logout = delete that file.

## Registry

Defaults to `https://www.synthesisui.com`. Override with:

```bash
synthesisui list --registry http://localhost:3000
# or
SYNTHESISUI_REGISTRY_URL=http://localhost:3000 synthesisui list
```

## License

MIT
