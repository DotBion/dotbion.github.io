# dotbion.github.io

Personal portfolio for Nobodit Choudhury, with an AI chat assistant and a
visitor counter.

**Live:** <https://dotbion.github.io>

## Architecture

Two independently deployed units:

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  This repo (GitHub Pages)   │        │  portfolio-api (Cloudflare)  │
│                             │        │                              │
│  index.html  ← generated    │  HTTPS │  /api/chat   → Gemini        │
│  assets/claude-shim.js ─────┼───────▶│  /api/visit  → counter       │
│  assets/config.js           │        │  /api/logs   → question log  │
│                             │        │            ↓                 │
│  static, no build step      │        │       D1 (SQLite)            │
└─────────────────────────────┘        └──────────────────────────────┘
```

The backend is a separate private repo, `portfolio-api`, deployed with
`wrangler`. It is not a submodule and not part of this build — the site reaches
it over HTTPS at the URL in [`assets/config.js`](assets/config.js).

## Layout

| Path | What it is |
|---|---|
| `index.html` | **Generated.** A ~2 MB self-extracting bundle exported from Claude Design. Never edit by hand. |
| `assets/claude-shim.js` | Wires the design's chat + counter to the Worker |
| `assets/config.js` | The Worker's base URL |
| `scripts/inject.sh` | Re-applies the five patches the design export doesn't include |
| `scripts/extract-resume.sh` | Regenerates the chatbot's knowledge base from the site copy |
| `scripts/verify-live.sh` | Compares local `index.html` against what's actually served |
| `.claude/skills/run-portfolio/` | Headless-Chrome harness for running and smoke-testing the site |

## Working on it

The site is static — open `index.html`, or serve it:

```bash
node .claude/skills/run-portfolio/driver.mjs serve
```

Port **8765 is required**. The Worker's `ALLOWED_ORIGINS` has no other local
entry, so any other port gets a 403 on every API call: the counter never
renders and the chat reports an error.

### Verifying

```bash
node .claude/skills/run-portfolio/driver.mjs smoke
```

Serves the site, drives real headless Chrome, waits for the bundle to swap the
document root, then checks the visitor counter and sends a real chat message.
Exits non-zero on failure.

This exists because the site is genuinely hard to check by hand: the bundle
replaces the entire document ~300 ms after load, and the counter is a separate
async fetch that is absent for several seconds after that.

### After re-exporting from Claude Design

A fresh export overwrites `index.html` and drops five patches — the add-on
script tags, `showAskAi: true`, the ⌘K shortcut, the job-description claim, and
the data-handling notice. The chat has **no visible entry point** until you
re-apply them:

```bash
./scripts/inject.sh
```

Idempotent; running it twice is a no-op.

## Deploying

Merging to `main` triggers a GitHub Pages rebuild (~1 min). The backend deploys
separately and is not affected by anything in this repo.

## Data handling

The chat stores visitor messages and sends them to Google's Gemini API, whose
free tier may use them for training. The chat panel says so, and the assistant
discloses it when asked.
