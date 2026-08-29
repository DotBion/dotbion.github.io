#!/usr/bin/env node
/**
 * One-time extraction: pull content from design/index.html (or index.html)
 * into content/ as editable JSON + blog template.
 *
 *   node scripts/extract-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJsArray, readTemplate } from './lib/bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const DESIGN = path.join(ROOT, 'design', 'index.html');
const FALLBACK = path.join(ROOT, 'index.html');

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function parseExperience(decoded) {
  const start = decoded.indexOf('id="work"');
  const end = decoded.indexOf('id="education"', start);
  const section = decoded.slice(start, end);
  const jobs = [];

  for (let n = 0; n < 10; n++) {
    if (!section.includes(`workToggle${n}`)) break;
    const re = new RegExp(
      `workToggle${n}[\\s\\S]*?` +
        `(?:padding-top: 3px;">|" style="font-family: var\\(--mono\\); font-size: 12\\.5px; color: var\\(--faint\\);">)([^<]+)<` +
        `[\\s\\S]*?<strong[^>]*>([^<]+)</strong>` +
        `[\\s\\S]*?border-radius: 10px;">([^<]+)</span>` +
        `[\\s\\S]*?font-size: 12\\.5px; color: var\\(--faint\\);">([^<]+)</span>` +
        `[\\s\\S]*?font-weight: 500;">([^<]+)</div>` +
        `[\\s\\S]*?workOpen${n}[\\s\\S]*?<ul[^>]*>([\\s\\S]*?)</ul>`,
      'i'
    );
    const m = section.match(re);
    if (!m) break;
    const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').trim();
    jobs.push({
      dates: decode(m[1]),
      company: decode(m[2]),
      badge: decode(m[3]),
      location: decode(m[4]),
      role: decode(m[5]),
      highlights: [...m[6].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) =>
        decode(x[1])
      ),
    });
  }
  return jobs;
}

function parseResumeSections(resumeText) {
  const sections = {};
  const lines = resumeText.split('\n');
  sections.headline = lines.find((l) => l.startsWith('Headline: '))?.slice(10) || '';
  for (const key of ['EDUCATION', 'SKILLS', 'AWARDS', 'EXTRAS']) {
    const line = lines.find((l) => l.startsWith(`${key}:`));
    sections[key.toLowerCase()] = line ? line.slice(key.length + 1).trim() : '';
  }
  return sections;
}

function parseSite(resumeText) {
  const first = resumeText.split('\n')[0];
  const parts = first.split(' — ').map((s) => s.trim());
  return {
    name: parts[0] || 'Nobodit Choudhury',
    email: parts[1] || '',
    location: parts[2] || '',
    linkedin: parts[3] || '',
    github: parts[4] || '',
    calendly: 'https://calendly.com/nc3610',
    showBlog: false,
  };
}

function ensureDesignSource(htmlPath) {
  const designDir = path.join(ROOT, 'design');
  if (!fs.existsSync(designDir)) fs.mkdirSync(designDir, { recursive: true });
  if (fs.existsSync(DESIGN)) return DESIGN;

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(
    /<!-- BEGIN portfolio-addons -->[\s\S]*?<!-- END portfolio-addons -->\n?/,
    ''
  );
  fs.writeFileSync(DESIGN, html);
  console.log(`  created design/index.html from ${path.basename(htmlPath)}`);
  return DESIGN;
}

function main() {
  const source = fs.existsSync(DESIGN) ? DESIGN : ensureDesignSource(FALLBACK);
  const { decoded } = readTemplate(source);

  const resumeMatch = decoded.match(/const RESUME = `([\s\S]*?)`;/);
  if (!resumeMatch) throw new Error('RESUME not found');
  const resumeText = resumeMatch[1].trim();

  const projects = extractJsArray(decoded, 'PROJECTS');
  const experience = parseExperience(decoded);
  const site = parseSite(resumeText);
  const sections = parseResumeSections(resumeText);

  fs.mkdirSync(path.join(CONTENT, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(CONTENT, 'blog'), { recursive: true });
  fs.mkdirSync(path.join(CONTENT, 'activity'), { recursive: true });

  fs.writeFileSync(
    path.join(CONTENT, 'site.json'),
    JSON.stringify(site, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(CONTENT, 'resume-sections.json'),
    JSON.stringify(sections, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(CONTENT, 'experience.json'),
    JSON.stringify(experience, null, 2) + '\n'
  );

  for (const p of projects) {
    const file = path.join(CONTENT, 'projects', `${slugify(p.name)}.json`);
    fs.writeFileSync(file, JSON.stringify(p, null, 2) + '\n');
  }

  const blogTemplate = path.join(CONTENT, 'blog', '_template.md');
  if (!fs.existsSync(blogTemplate)) {
    fs.writeFileSync(
      blogTemplate,
      `---
title: "Post title"
date: 2026-08-29
summary: "One-line teaser shown on the homepage."
---

Write the post body here. Plain text / markdown — the build renders summary on the homepage for now.
`
    );
  }

  const activityKeep = path.join(CONTENT, 'activity', '.gitkeep');
  if (!fs.existsSync(activityKeep)) fs.writeFileSync(activityKeep, '');

  console.log('  wrote content/site.json');
  console.log(`  wrote content/experience.json (${experience.length} jobs)`);
  console.log(`  wrote content/projects/*.json (${projects.length} projects)`);
  console.log('  wrote content/resume-sections.json');
}

main();
