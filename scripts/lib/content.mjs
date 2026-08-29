import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const CONTENT_DIR = path.join(ROOT, 'content');

export function loadSite() {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'site.json'), 'utf8'));
}

export function loadResumeSections() {
  return JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'resume-sections.json'), 'utf8')
  );
}

export function loadExperience() {
  return JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'experience.json'), 'utf8')
  );
}

export function loadProjects() {
  const dir = path.join(CONTENT_DIR, 'projects');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function loadBlogPosts() {
  const dir = path.join(CONTENT_DIR, 'blog');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .reverse()
    .map((f) => parseMarkdownPost(path.join(dir, f)));
}

function parseMarkdownPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { file: path.basename(filePath), title: path.basename(filePath), body: raw };
  }
  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { file: path.basename(filePath), ...meta, body: match[2].trim() };
}

/** Build the RESUME template literal the design embeds (also feeds Worker knowledge). */
export function buildResumeText(site, sections, experience, projects) {
  const contact = [
    site.name,
    site.email,
    site.location,
    site.linkedin,
    site.github,
  ].join(' — ');

  const expLines = experience.map((job) => {
    const summary = job.highlights.join('; ');
    return `- ${job.company}, ${job.role} (${job.dates}, ${job.location}): ${summary}`;
  });

  const projectLines = projects.map((p) => {
    const url = p.url ? ` (${p.url.replace(/^https?:\/\//, '')})` : '';
    return `- ${p.name}${url}: ${p.short}`;
  });

  return [
    contact,
    `Headline: ${sections.headline}`,
    `EDUCATION: ${sections.education}`,
    'EXPERIENCE:',
    ...expLines,
    'PROJECTS:',
    ...projectLines,
    `SKILLS: ${sections.skills}`,
    `AWARDS: ${sections.awards}`,
    `EXTRAS: ${sections.extras}`,
  ].join('\n');
}

/** Worker-facing markdown generated from the same content files. */
export function buildKnowledgeMarkdown(site, sections, experience, projects) {
  const lines = [
    `# ${site.name}`,
    '',
    [site.email, site.location, site.linkedin, site.github].join(' · '),
    '',
    sections.headline,
    '',
    '## Education',
    '',
    sections.education,
    '',
    '## Experience',
    '',
  ];

  for (const job of experience) {
    lines.push(
      `### ${job.company} — ${job.role}`,
      '',
      `${job.dates} · ${job.location} · ${job.badge}`,
      '',
      ...job.highlights.map((h) => `- ${h}`),
      ''
    );
  }

  lines.push('## Projects', '');
  for (const p of projects) {
    lines.push(`### ${p.name}`, '', p.full, '');
    if (p.url) lines.push(p.url, '');
    lines.push(`Stack: ${p.stack.join(', ')}`, '');
  }

  lines.push(
    '## Skills',
    '',
    sections.skills,
    '',
    '## Awards',
    '',
    sections.awards,
    '',
    '## Extras',
    '',
    sections.extras,
    ''
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
