#!/usr/bin/env bash
#
# Extract the RESUME string the design embeds in index.html and write it out as
# the Worker's Markdown knowledge base.
#
# Prefer: node scripts/build.mjs  (generates knowledge from content/ — single
# source of truth). Use this script only for legacy one-off extraction from a
# hand-edited bundle before content/ exists.
#
# NOTE: this OVERWRITES knowledge/resume.md. Once you start hand-editing that
# file (adding an FAQ, project detail, tone notes), stop running this script or
# you will lose those edits.
#
#   ./scripts/extract-resume.sh [path-to-portfolio-api]

set -euo pipefail

cd "$(dirname "$0")/.."

API_DIR="${1:-../portfolio-api}"
OUT="$API_DIR/knowledge/resume.md"

[ -d "$API_DIR" ] || { echo "error: '$API_DIR' not found" >&2; exit 1; }
mkdir -p "$API_DIR/knowledge"

node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");

const tpl = html.match(/<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/);
if (!tpl) { console.error("error: bundler template not found in index.html"); process.exit(1); }

const decoded = JSON.parse(tpl[1].trim());
const resume = decoded.match(/const RESUME = `([\s\S]*?)`;/);
if (!resume) { console.error("error: RESUME string not found in the template"); process.exit(1); }

const raw = resume[1].trim();
const lines = raw.split("\n");

// First line is the contact strip; everything after is "LABEL: content".
const out = ["# Nobodit Choudhury", "", lines[0].trim(), ""];

for (const line of lines.slice(1)) {
  const m = line.match(/^([A-Z][A-Za-z &]*):\s*(.*)$/);
  if (m) {
    const heading = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    out.push(`## ${heading}`, "", m[2].trim(), "");
  } else if (line.trim()) {
    out.push(line.trim(), "");
  }
}

fs.writeFileSync(process.argv[1], out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
console.log("  wrote " + process.argv[1] + " (" + raw.length + " chars of source)");
' "$OUT"
