#!/usr/bin/env node
/**
 * Build index.html from design/index.html + content/, run inject.sh,
 * and optionally write Worker knowledge markdown.
 *
 *   node scripts/build.mjs [--api-dir ../portfolio-api]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { readTemplate, writeTemplate } from './lib/bundle.mjs';
import {
  buildKnowledgeMarkdown,
  buildResumeText,
  loadBlogPosts,
  loadExperience,
  loadProjects,
  loadResumeSections,
  loadSite,
} from './lib/content.mjs';
import {
  patchBlogSection,
  patchExperience,
  patchProjects,
  patchResume,
  patchShowBlog,
  stripClientSystemPrompt,
} from './lib/patch-template.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN = path.join(ROOT, 'design', 'index.html');
const OUT = path.join(ROOT, 'index.html');

function parseArgs(argv) {
  const opts = { apiDir: process.env.PORTFOLIO_API_DIR || '../portfolio-api' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--api-dir') opts.apiDir = argv[++i];
    if (argv[i] === '--no-knowledge') opts.noKnowledge = true;
  }
  return opts;
}

function writeKnowledge(markdown, apiDir) {
  const resolved = path.resolve(ROOT, apiDir);
  const outPath = path.join(resolved, 'knowledge', 'resume.md');
  if (fs.existsSync(path.dirname(outPath))) {
    fs.writeFileSync(outPath, markdown);
    console.log(`  wrote ${outPath}`);
    return;
  }
  const fallback = path.join(ROOT, 'build', 'knowledge', 'resume.md');
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  fs.writeFileSync(fallback, markdown);
  console.log(`  portfolio-api not found — wrote ${fallback}`);
}

function main() {
  const opts = parseArgs(process.argv);

  if (!fs.existsSync(DESIGN)) {
    console.error('error: design/index.html not found. Run: node scripts/extract-content.mjs');
    process.exit(1);
  }

  const site = loadSite();
  const sections = loadResumeSections();
  const experience = loadExperience();
  const projects = loadProjects();
  const posts = loadBlogPosts();

  const resumeText = buildResumeText(site, sections, experience, projects);
  let { html, decoded } = readTemplate(DESIGN);

  decoded = patchResume(decoded, resumeText);
  decoded = patchProjects(decoded, projects);
  decoded = patchExperience(decoded, experience);
  decoded = stripClientSystemPrompt(decoded);
  decoded = patchShowBlog(decoded, site.showBlog);
  if (posts.length) decoded = patchBlogSection(decoded, posts);

  writeTemplate(OUT, html, decoded);
  console.log(`  built ${OUT}`);

  execSync(`"${path.join(ROOT, 'scripts', 'inject.sh')}"`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (!opts.noKnowledge) {
    const md = buildKnowledgeMarkdown(site, sections, experience, projects);
    writeKnowledge(md, opts.apiDir);
  }
}

main();
