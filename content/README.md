# Content source files

Edit these files to update the portfolio. Run the build to apply changes:

```bash
node scripts/extract-content.mjs   # one-time: pull from design/index.html
node scripts/build.mjs             # build index.html + Worker knowledge
```

## Layout

| Path | Purpose |
|---|---|
| `site.json` | Name, contact, links, `showBlog` toggle |
| `resume-sections.json` | Headline, education, skills, awards, extras (RESUME text) |
| `experience.json` | Work history (renders `#work` section) |
| `projects/*.json` | One file per project (renders `#projects` + RESUME) |
| `blog/*.md` | Posts with YAML frontmatter (omit `_`-prefixed files) |
| `activity/` | Daily log entries (Phase 3 — not wired yet) |

## Re-exporting from Claude Design

1. Save export as `design/index.html` (no portfolio add-ons).
2. Run `node scripts/extract-content.mjs` if structure changed materially.
3. Run `node scripts/build.mjs`.

Cloudflare chat/counter wiring (`assets/config.js`, `inject.sh`) is applied automatically by the build.
