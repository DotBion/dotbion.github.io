---
name: run-portfolio
description: Run, serve, screenshot, smoke-test, or debug the dotbion.github.io portfolio site and its AI chat assistant. Use when asked to start the site, take a screenshot of it, verify the chatbot or visitor counter works, test the Worker API endpoints, or reproduce a UI bug locally.
---

# Run the portfolio site

Static site (`index.html` is a 2 MB self-extracting bundle) plus a Cloudflare
Worker backend that powers the AI chat and visitor counter.

Drive it with **`.claude/skills/run-portfolio/driver.mjs`** — a zero-dependency
harness that serves the site, launches headless Chrome over CDP, waits for the
bundle to finish swapping the document, and drives the real UI. There is no
`package.json` here and none is needed.

All paths below are relative to the site root (`dotbion.github.io/`).

## Prerequisites

- **Node 22+** (needs the global `WebSocket`; verified on v24.18.1)
- **Google Chrome or Chromium.** Auto-detected at
  `/Applications/Google Chrome.app/...` and the usual Linux paths. Override with
  `CHROME=/path/to/chrome`.

No install step. No build step — the site is served as-is.

## Run (agent path) — start here

```bash
node .claude/skills/run-portfolio/driver.mjs smoke
```

Full end-to-end: serves the site, loads it, waits for the document swap, checks
the visitor counter rendered, opens the chat, sends a real question, verifies a
real answer came back, and writes a screenshot. **Exits 1 on failure**, so it
works in CI. Takes ~15s.

```
  ok   bundle swapped + rendered (288ms)
  ok   counter renders: "5 visitors"
  ok   chat panel opens
  ok   chat replied in 1205ms: Nobodit has worked on several machine learning...
  ok   screenshot -> .claude/skills/run-portfolio/shots/smoke.png
SMOKE PASSED
```

Other commands:

```bash
node .claude/skills/run-portfolio/driver.mjs shot /tmp/hero.png
```

```bash
node .claude/skills/run-portfolio/driver.mjs chat "Which projects suit an MLOps role?"
```

```bash
node .claude/skills/run-portfolio/driver.mjs api
```

`shot` screenshots the loaded page (defaults to `shots/site.png`). `chat` sends
one question through the real UI and prints the reply. `api` hits the deployed
Worker directly — no browser — and asserts that `/api/chat` is 403 without an
`Origin` and `/api/logs` is 401 without a key.

Screenshots land in `.claude/skills/run-portfolio/shots/` (gitignored).

## Run (human path)

```bash
node .claude/skills/run-portfolio/driver.mjs serve
```

Serves at <http://localhost:8765> until Ctrl-C. Same thing as
`python3 -m http.server 8765`, but keeps the port consistent — see the port
gotcha below.

## After re-exporting the design

If `index.html` is regenerated from Claude Design, it loses four patches
(the add-on `<script>` tags, `showAskAi: true`, the ⌘K shortcut, and the chat
header copy). The chat will have **no visible entry point** until you re-apply:

```bash
./scripts/inject.sh
```

Idempotent — safe to run repeatedly.

## The backend

Lives in a **separate directory**, `../portfolio-api` (its own deployable). The
site talks to the deployed Worker via the URL in `assets/config.js`, so you do
**not** need to run it locally to use this driver.

```bash
cd ../portfolio-api && npm run deploy
```

## Gotchas

- **The bundle replaces the whole document.** `index.html`'s loader ends with
  `document.documentElement.replaceWith(...)`, ~300ms after load. Waiting for
  `load` or `DOMContentLoaded` is **not enough** — anything you query before the
  swap is discarded with the old document, and injected `<script>` tags are
  destroyed (only `window` state survives). The driver's `waitForSwap()` polls
  until the real content exists.

- **`PORT` must stay 8765.** The Worker's `ALLOWED_ORIGINS` lists
  `http://localhost:8765` and nothing else local. Running on any other port
  gives a 403 on every API call: the counter never renders and the chat shows
  *"Hmm, something went wrong reaching the assistant."* Verified with `PORT=3000`.

- **Never detect a chat reply by scraping `body.innerText`.** It captures the
  `thinking…` placeholder plus the input-area chrome, which looks like a
  successful answer — this produced a false PASS during development. Assistant
  bubbles are `div`s with `justify-content: flex-start`; the visitor's own are
  `flex-end`. Count the bubbles instead.

- **The chat header is also a flex row with `flex-end`**, so a naive
  "user bubble" query picks it up. Filter on `flex-start` for replies.

- **A reply bubble is not a working chat.** The design renders its own error
  text as an assistant bubble, and the Worker returns friendly copy for 429/502.
  The driver treats *"something went wrong" / "unavailable right now" /
  "Too many messages"* as failures.

- **The counter is a separate async fetch** and is absent for ~5 seconds after
  the swap. Checking immediately reports a false negative; the driver polls up
  to 15s.

- **Setting `textarea.value` does nothing** — the framework owns it. The driver
  uses the native `HTMLTextAreaElement.prototype.value` setter plus a bubbling
  `input` event.

- **Rate limits bite during iteration.** 15 messages / 10 min per IP (the
  Worker's own limiter, returns *"Too many messages"*), and the Gemini free tier
  allows **500 requests/day** on `gemini-3.5-flash-lite`. Repeated `smoke` runs
  consume both. Quotas: <https://ai.dev/rate-limit>.

- **`.claude/` is gitignored except `skills/`.** This skill and its driver are
  committed; `launch.json` and `shots/` are not.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no "Ask AI" button` | `index.html` was re-exported without patches — run `./scripts/inject.sh` |
| Counter FAILs, chat says *"something went wrong"* | Wrong port. Use the default 8765 |
| `Too many messages — give it a minute` | The Worker's own limiter. Wait ~10 min, or raise `RATE_LIMIT` in `../portfolio-api/src/index.ts` |
| `The assistant is unavailable right now` | Gemini quota exhausted or Worker error. Check `cd ../portfolio-api && npx wrangler tail`, then <https://ai.dev/rate-limit> |
| `no Chrome found` | `CHROME=/path/to/chrome node .claude/skills/run-portfolio/driver.mjs smoke` |
| `CHROME is set to "…" but that path does not exist` | Fix or unset `CHROME` — an explicit override is honoured strictly, with no fallback |
| `bundle never swapped the document root within 30s` | The static server isn't serving `index.html`, or the bundle is corrupt. Check `curl -sI http://localhost:8765/` |
| `EADDRINUSE` | A previous run is still up: `pkill -f driver.mjs` (or `lsof -ti:8765 \| xargs kill`) |
