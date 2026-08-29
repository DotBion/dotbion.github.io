import { htmlEscape, replaceProjectsConst } from './bundle.mjs';

/** Patch experience rows in place (preserves design HTML + comment anchors). */
export function patchExperience(decoded, jobs) {
  let out = decoded;
  jobs.forEach((job, n) => {
    out = patchJobOccurrences(out, n, job);
  });
  return out;
}

function patchJobOccurrences(source, n, job) {
  let out = source;
  const toggle = `workToggle${n}`;
  let idx = 0;
  while ((idx = out.indexOf(toggle, idx)) !== -1) {
    const tail = out.slice(idx);
    const nextToggle = tail.slice(toggle.length).search(/workToggle\d+/);
    const end = nextToggle === -1 ? tail.length : toggle.length + nextToggle;
    const block = tail.slice(0, end);
    const patched = patchJobBlock(block, n, job);
    out = out.slice(0, idx) + patched + tail.slice(end);
    idx += patched.length;
  }
  return out;
}

function patchJobBlock(block, n, job) {
  let out = block;
  out = out.replace(
    /(padding-top: 3px;">)[^<]+(<)/,
    `$1${htmlEscape(job.dates)}$2`
  );
  out = out.replace(
    /(font-size: 12\.5px; color: var\(--faint\);">)[^<]+(<)/,
    `$1${htmlEscape(job.dates)}$2`
  );
  out = out.replace(
    /(<strong[^>]*>)[^<]+(<\/strong>)/,
    `$1${htmlEscape(job.company)}$2`
  );
  const chips = [...out.matchAll(/border-radius: 10px;">[^<]+<\/span>/g)];
  if (chips[0]) {
    out = out.replace(
      chips[0][0],
      `border-radius: 10px;">${htmlEscape(job.badge)}</span>`
    );
  }
  const faintLocs = [
    ...out.matchAll(/font-size: 12\.5px; color: var\(--faint\);">[^<]+<\/span>/g),
  ];
  const locSpan = faintLocs[faintLocs.length - 1];
  if (locSpan) {
    out = out.replace(
      locSpan[0],
      `font-size: 12.5px; color: var(--faint);">${htmlEscape(job.location)}</span>`
    );
  }
  out = out.replace(
    /font-weight: 500;">[^<]+(<\/div>)/,
    `font-weight: 500;">${htmlEscape(job.role)}$1`
  );
  const ulRe = new RegExp(
    `(workOpen${n}[\\s\\S]*?<ul[^>]*>)[\\s\\S]*?(</ul>)`,
    'i'
  );
  const lis = job.highlights
    .map((h) => `            <li>${htmlEscape(h)}</li>`)
    .join('\n');
  out = out.replace(ulRe, `$1\n${lis}\n          $2`);
  return out;
}

export function patchProjects(decoded, projects) {
  return replaceProjectsConst(decoded, projects);
}

export function patchResume(decoded, resumeText) {
  return decoded.replace(
    /const RESUME = `[\s\S]*?`;/,
    `const RESUME = \`${resumeText.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`;`
  );
}

/** Remove client-side system prompt text (Worker owns the real prompt). */
export function stripClientSystemPrompt(decoded) {
  return decoded.replace(
    /system: `You are the AI assistant[\s\S]*?\$\{RESUME\}`,/,
    "system: '',"
  );
}

export function patchShowBlog(decoded, showBlog) {
  if (showBlog) {
    return decoded.replace(/showBlog: this\.props\.showBlog \?\? false/, 'showBlog: true');
  }
  return decoded;
}

export function patchBlogSection(decoded, posts) {
  if (!posts.length) return decoded;

  const cards = posts
    .map(
      (p) => `        <div style="display: grid; gap: 2px; border-top: 1px solid var(--border); padding-top: 16px;">
          <span style="font-family: var(--mono); font-size: 12px; color: var(--faint);">${htmlEscape(p.date || '')}</span>
          <strong style="font-size: 16px;">${htmlEscape(p.title || 'Untitled')}</strong>
          <span style="font-size: 13.5px; color: var(--muted);">${htmlEscape(p.summary || p.body.slice(0, 160))}</span>
        </div>`
    )
    .join('\n');

  const inner = `<div style="display: grid; gap: 16px;">\n${cards}\n      </div>`;
  return decoded.replace(
    /(<section id="writing"[\s\S]*?<div style="display: grid; gap: 16px;">)[\s\S]*?(<\/div>\s*<\/section>)/,
    `$1\n${cards}\n      $2`
  );
}
