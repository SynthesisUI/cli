# synthesisui

CLI to bring design systems published on [SynthesisUI](https://www.synthesisui.com)
into any project. It materializes the system into `_synthesisui/ds/<slug>/` and injects
a managed block into the root `CLAUDE.md`, so Claude Code builds components following the
design system.

## Usage

Without installing anything:

```bash
npx synthesisui login        # connect the CLI to your account (device-flow in the browser)
npx synthesisui list         # list the available design systems
npx synthesisui add <slug>   # bring a DS into _synthesisui/ds/<slug>/
```

Or install globally:

```bash
npm install -g synthesisui
synthesisui add halogen
```

### What `add` materializes

In `_synthesisui/ds/<slug>/`:

- `design-system.json` — the canonical source of truth of the design system
- `tokens.css` — CSS custom properties scoped by `data-ds`
- `theme.css` — optional Tailwind v4 `@theme` adapter (use `bg-primary`, `p-md`, … backed by the tokens)
- `GUIDE.md` — instructions for the agent (semantic roles, mood, recipes, how to add components)
- `.lock` — pinned slug + version (reproducible)

And it injects an idempotent `<!-- synthesisui:start/end -->` block into the root `CLAUDE.md`,
reflecting every installed DS.

## Authentication

`synthesisui login` uses device-flow (RFC 8628): it opens the browser, you confirm a code,
and the token is saved to `~/.synthesisui/credentials.json` (per machine). Logout = delete that file.

## Registry

By default it points to `https://www.synthesisui.com`. Override it with:

```bash
synthesisui list --registry http://localhost:3000
# or
SYNTHESISUI_REGISTRY_URL=http://localhost:3000 synthesisui list
```

## License

MIT
