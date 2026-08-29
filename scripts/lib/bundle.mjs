import fs from 'node:fs';

/** Read the Claude Design bundler template string from index.html. */
export function readTemplate(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(
    /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error(`bundler template not found in ${htmlPath}`);
  return { html, decoded: JSON.parse(match[1].trim()) };
}

/** Write updated template back into index.html. */
export function writeTemplate(htmlPath, html, decoded) {
  let serialized = JSON.stringify(decoded);
  // Claude Design exports closing tags as <\u002Ftag> inside the JSON string.
  // Without this, inject.sh sees extra literal </body> matches and aborts.
  serialized = serialized.replace(/<\//g, '<\\u002F');
  const out = html.replace(
    /<script type="__bundler\/template"[^>]*>[\s\S]*?<\/script>/,
    `<script type="__bundler/template">${serialized}</script>`
  );
  fs.writeFileSync(htmlPath, out);
}

/** Extract a JS array literal assigned to `const NAME = [...]`. */
export function extractJsArray(source, name) {
  const marker = `const ${name} = [`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`${name} array not found`);
  let depth = 0;
  let i = start + `const ${name} = `.length;
  for (; i < source.length; i++) {
    if (source[i] === '[') depth++;
    if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const literal = source.slice(start + `const ${name} = `.length, i);
  return Function(`return ${literal}`)();
}

/** Replace `const NAME = ...` assignment (array or template literal). */
export function replaceConst(source, name, newValue) {
  if (Array.isArray(newValue) || (newValue && typeof newValue === 'object')) {
    const body = `const ${name} = ${toJsLiteral(newValue)};`;
    return source.replace(
      new RegExp(`const ${name} = \\[[\\s\\S]*?\\];`),
      body
    );
  }
  if (typeof newValue === 'string') {
    return source.replace(
      new RegExp(`const ${name} = \`[\\s\\S]*?\`;`),
      `const ${name} = \`${escapeBackticks(newValue)}\`;`
    );
  }
  throw new Error(`unsupported replacement type for ${name}`);
}

function escapeBackticks(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function toJsLiteral(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'")
    .replace(/'(\d+)':/g, '$1:')
    .replace(/\\u2019/g, '\u2019')
    .replace(/\\u2014/g, '\u2014')
    .replace(/\\u00d7/g, '\u00d7');
}

/** Serialize projects for the bundle. */
export function projectsToJs(projects) {
  return JSON.stringify(projects, null, 2).replace(/^/gm, '    ').trimStart();
}

export function replaceProjectsConst(source, projects) {
  const body = `const PROJECTS = ${projectsToJs(projects)};`;
  return source.replace(/const PROJECTS = \[[\s\S]*?\];/, body);
}

export function htmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
