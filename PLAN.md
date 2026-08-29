# Portfolio developer-friendly migration plan

> **Status:** Planned · not started  
> **Last updated:** 2026-08-29  
> **Repos:** `dotbion.github.io` (this site) + `portfolio-api` (Cloudflare Worker)

## Goal

Make updates to work, projects, blog posts, and daily activity as easy as editing a file and pushing — without opening a ~2 MB `index.html` or re-syncing content in multiple places.

**Target workflow:**

```text
Edit markdown/YAML → git push → site + AI knowledge update automatically
```

---

## Current architecture

```text
Claude Design export          GitHub Pages              Cloudflare Worker
─────────────────────         ────────────              ─────────────────
index.html (~2 MB)     →      dotbion.github.io   +     portfolio-api.nc3610.workers.dev
  ├─ fonts, images              assets/config.js          /api/chat
  ├─ RESUME string              assets/claude-shim.js     /api/visit
  ├─ PROJECTS array
  ├─ experience = hardcoded HTML
  └─ blog = "Coming soon" placeholder
```

### Existing glue (keep these)

| Script | Purpose |
|---|---|
| `scripts/inject.sh` | Re-applies Cloudflare shim + Ask AI patches after every Claude Design re-export |
| `scripts/extract-resume.sh` | Copies `RESUME` from HTML → Worker knowledge base |
| `scripts/verify-live.sh` | Checks local vs live before editing |

### Content locations today (the problem)

| Content | Where it lives | Pain |
|---|---|---|
| Resume / bio | `RESUME` string inside bundle | Edit 2 MB file or re-export from Claude Design |
| Projects (8) | `PROJECTS` JS array in bundle | Same |
| Work history | Hardcoded HTML rows (`workToggle0`, etc.) | Not data-driven |
| Blog | Placeholder, `showBlog: false` | No posts, no structure |
| Daily activity | Does not exist | — |
| AI chat knowledge | Separate `portfolio-api/knowledge/resume.md` | Must run `extract-resume.sh` or it goes stale |

Every content update currently risks: re-export → re-inject → re-extract → deploy site → deploy worker.

---

## Target architecture

```text
content/                  ← edit here (source of truth)
  site.yaml
  experience.yaml
  projects/
  blog/
  activity/

design/
  index.html              ← Claude Design export (input, not hand-edited)

scripts/
  build.mjs               ← content → HTML + worker knowledge
  inject.sh               ← called by build, not manually

assets/
  config.js
  claude-shim.js

dist/                     ← built output deployed to Pages
  (or overwrite index.html at repo root)

.github/workflows/
  deploy.yml              ← build + deploy on content/design changes
```

Treat `index.html` as **build output**, not source.

---

## Phases

### Phase 1 — Extract content from the bundle (highest ROI)

**Goal:** Keep Claude Design as the UI shell; move all editable content out.

- [ ] **One-time extraction** — pull current content into `content/`:
  - `RESUME` → `content/site.yaml` + `content/experience.yaml`
  - `PROJECTS` array → `content/projects/*.yaml`
  - Blog placeholder → `content/blog/` with a post template
- [ ] **Add `scripts/build.mjs`** that:
  - Reads `content/`
  - Injects/replaces `RESUME`, `PROJECTS`, experience HTML, and blog list into the design bundle
  - Runs `inject.sh` automatically
  - Generates Worker knowledge from the same files (replaces manual `extract-resume.sh`)
- [ ] **GitHub Action** — on push to `content/**`:
  - Run `node scripts/build.mjs`
  - Deploy to GitHub Pages
  - Deploy updated knowledge to the Worker

**Outcome:** Update work by editing YAML/Markdown. Single source of truth for site + AI chat.

---

### Phase 2 — Blogs that are easy to write

The design already has a Writing section gated by `showBlog`. Wire it to real data.

#### Option A — Static (recommended first)

Markdown posts with frontmatter; build step renders the list and post bodies.

```yaml
# content/blog/2026-08-24-first-post.md
---
title: "Why I pivoted from DINOv2 to MoCo v3"
date: 2026-08-24
summary: "12× speedup on 500k unlabeled images"
tags: [ml, self-supervised]
---
Body in markdown...
```

- [ ] Add blog post schema / frontmatter convention
- [ ] Build step renders post list into the Writing section
- [ ] Flip `showBlog: true` once the first post exists
- [ ] (Optional) Individual post pages or expandable cards

#### Option B — Worker-served (later, if needed)

- Store posts in Cloudflare KV/R2 or fetch from GitHub raw
- Frontend fetches `/api/blog` at load
- Useful for publishing without redeploying the 2 MB bundle

For most use, **Option A is enough**.

---

### Phase 3 — Daily activity at your fingertips

Lightweight activity log, separate from long-form blog posts.

```yaml
# content/activity/2026-08-24.yaml
date: 2026-08-24
items:
  - "Shipped portfolio content pipeline"
  - "Swam 2k at NYU pool"
  - "Read: Attention Is All You Need (re-read)"
links:
  - { label: "PR #42", url: "https://github.com/DotBion/..." }
```

- [ ] Add `content/activity/` with dated YAML entries
- [ ] Build step surfaces last 7 days on the homepage ("Recent")
- [ ] (Optional) Full `/activity` page
- [ ] (Optional) Worker pulls GitHub commit feed or other external sources

Start with hand-written YAML — fast to maintain, fully in your control.

---

### Phase 4 — Fix re-export fragility

Claude Design re-exports wipe `index.html`. Make that safe:

| Today | After Phase 4 |
|---|---|
| Manually run `inject.sh` after export | `build.mjs` always runs inject |
| Manually run `extract-resume.sh` | Build generates Worker knowledge |
| Manually verify live vs local | CI checks hash / deploys on green |
| Edit experience as HTML in bundle | `experience.yaml` → build generates rows |

- [ ] Move Claude export to `design/index.html`
- [ ] CI builds `dist/index.html` (or root `index.html`) from design + content
- [ ] Document the re-export workflow in this file

**Re-export checklist (target):**

1. Export from Claude Design → save as `design/index.html`
2. `git add design/index.html && git push` (or run build locally first)
3. CI runs build + deploy — no manual inject/extract steps

---

### Phase 5 — Escape the monolith (optional, longer term)

If Claude Design exports become limiting, migrate UI to **Astro** or **11ty**:

- Reuse the same `content/` folder — no content migration
- Native Markdown/MDX, RSS, tags, OG images
- Still deploy to GitHub Pages + keep Cloudflare Worker for chat

Bigger one-time cost. Phases 1–3 deliver most of the DX win without a redesign.

---

## Content file schemas (draft)

### `content/site.yaml`

```yaml
name: Nobodit Choudhury
email: nc3610@nyu.edu
location: New York, NY
headline: "Machine Learning | AI | Software | Research"
links:
  linkedin: linkedin.com/in/nobo
  github: github.com/dotBion
calendly: https://calendly.com/nc3610
```

### `content/experience.yaml`

```yaml
- company: NYU IT
  role: SWE Intern
  dates: "Jun 2025 — May 2026"
  location: New York, NY
  badge: Internship
  summary: "Fault-tolerant ETL on AWS Step Functions..."
  highlights:
    - "Migrated 6000+ Oracle objects to Snowflake"
    - "Python validation pipelines saving 10+ hrs/week"
```

### `content/projects/*.yaml`

```yaml
name: Agent-007
sub: Agentic LLM CTF Solver
meta: "2025 · Agentic AI"
short: "Autonomous agent solving security CTF challenges..."
full: "Autonomous agent solving security CTF challenges with a 9/10 solve rate..."
stack: [Claude Code, Codex, Kiro, MCP]
url: https://github.com/DotBion/mlcybersec
kind: github
```

---

## What not to do

- **Do not** keep hand-editing `index.html` for content — it will not scale.
- **Do not** maintain resume in two places (HTML + Worker) — generate Worker knowledge from `content/`.
- **Do not** jump to a headless CMS yet — Markdown + YAML + git is enough until non-technical collaborators need to edit posts.
- **Do not** delete `inject.sh` / `claude-shim.js` — they solve real production problems; fold them into the build pipeline instead.

---

## Minimal first step

If starting incrementally:

1. Create `content/` and extract current `RESUME`, `PROJECTS`, and experience into YAML/Markdown.
2. Write `scripts/build.mjs` that patches the bundle and generates Worker knowledge.
3. Add one real blog post so `showBlog` has something to show.
4. Add `content/activity/` with a 7-day rolling log.

That turns "open 2 MB HTML and pray" into "edit a file, push, done."

---

## Open questions

- [ ] Deploy built output to repo root `index.html` or a `dist/` folder (GitHub Pages config)?
- [ ] Where does `portfolio-api` live, and how should CI push updated `knowledge/*.md`?
- [ ] Blog: in-page cards only, or separate post pages from day one?
- [ ] Activity: homepage strip only, or dedicated page too?
