#!/usr/bin/env node
/**
 * driver.mjs — headless harness for the dotbion.github.io portfolio site.
 *
 * Zero dependencies on purpose: this repo has no package.json and is a plain
 * static site. Node 22+ ships a global WebSocket, so we drive the system Chrome
 * over CDP directly instead of pulling in Playwright/Puppeteer.
 *
 * Usage (paths relative to the site root):
 *   node .claude/skills/run-portfolio/driver.mjs smoke
 *   node .claude/skills/run-portfolio/driver.mjs shot [out.png]
 *   node .claude/skills/run-portfolio/driver.mjs chat "What ML systems has he built?"
 *   node .claude/skills/run-portfolio/driver.mjs api
 *   node .claude/skills/run-portfolio/driver.mjs serve
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../../..');          // .claude/skills/run-portfolio -> site root
const PORT = Number(process.env.PORT || 8765);   // must be in the Worker's ALLOWED_ORIGINS
const ORIGIN = `http://localhost:${PORT}`;
const SHOTS = join(SITE, '.claude', 'skills', 'run-portfolio', 'shots');

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const log = (...a) => console.log(...a);
const die = (m) => { console.error(`ERROR: ${m}`); process.exit(1); };

/* ---------------------------------------------------------------- server */

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
      const file = join(SITE, path === '/' ? 'index.html' : path);
      if (!file.startsWith(SITE)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

/* ------------------------------------------------------------------- CDP */

class CDP {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map(); }

  static async attach() {
    // An explicit CHROME= is honoured or fails loudly — silently falling back to
    // a different browser than the one asked for is worse than an error.
    if (process.env.CHROME && !existsSync(process.env.CHROME)) {
      die(`CHROME is set to "${process.env.CHROME}" but that path does not exist`);
    }
    const bin = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!bin) die(`no Chrome found. Set CHROME=/path/to/chrome. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);

    const port = 9222 + Math.floor(Math.random() * 500);
    const proc = spawn(bin, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=/tmp/portfolio-driver-${port}`, `--remote-debugging-port=${port}`,
      '--window-size=1280,900', 'about:blank',
    ], { stdio: 'ignore' });

    let info = null;
    for (let i = 0; i < 40 && !info; i++) {
      try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); }
      catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!info) { proc.kill(); die('Chrome did not expose a CDP port in 10s'); }

    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('CDP socket failed')); });

    const cdp = new CDP(ws);
    cdp.proc = proc;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      const p = cdp.pending.get(msg.id);
      if (!p) return;
      cdp.pending.delete(msg.id);
      msg.error ? p.no(new Error(msg.error.message)) : p.ok(msg.result);
    };

    // Flattened session: every page command carries sessionId.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    cdp.session = sessionId;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (this.session && !method.startsWith('Target.')) payload.sessionId = this.session;
    this.ws.send(JSON.stringify(payload));
    return new Promise((ok, no) => this.pending.set(id, { ok, no }));
  }

  /** Evaluate in the page and return the JS value (awaits promises). */
  async eval(fn, ...args) {
    const src = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    const r = await this.send('Runtime.evaluate', {
      expression: src, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result.value;
  }

  async close() { try { this.ws.close(); } catch {} this.proc?.kill(); }
}

/* ------------------------------------------------------- page primitives */

/**
 * index.html is a self-extracting bundle whose loader finishes with
 * document.documentElement.replaceWith(...). Waiting for `load` is NOT enough —
 * the real page appears afterwards, and anything queried before the swap is
 * thrown away with the old document.
 */
async function waitForSwap(cdp, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await cdp.eval(() =>
      !document.querySelector('#__bundler_thumbnail') &&
      !!document.body && document.body.children.length > 0 &&
      /Nobodit/i.test(document.body.innerText || ''));
    if (ready) return Date.now() - started;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('bundle never swapped the document root within 30s');
}

async function open(cdp) {
  await cdp.send('Page.navigate', { url: `${ORIGIN}/?driver=1` });
  const ms = await waitForSwap(cdp);
  return ms;
}

async function openChat(cdp) {
  return cdp.eval(async () => {
    const sleep = (m) => new Promise((r) => setTimeout(r, m));
    const isOpen = () => !!document.querySelector('textarea[placeholder*="Ask about"]');
    if (!isOpen()) {
      const btn = [...document.querySelectorAll('button')].find((b) => /ask ai/i.test(b.textContent || ''));
      if (!btn) return { ok: false, why: 'no "Ask AI" button — is showAskAi patched? run scripts/inject.sh' };
      btn.click();
      for (let i = 0; i < 20 && !isOpen(); i++) await sleep(100);
    }
    return { ok: isOpen(), why: isOpen() ? '' : 'panel did not open' };
  });
}

/**
 * Chat bubbles are flex rows: assistant replies are `justify-content:flex-start`,
 * the visitor's own messages are `flex-end`. Scraping body.innerText instead
 * silently captures the "thinking…" placeholder and the input-area chrome, which
 * reads as a successful reply — count the assistant bubbles instead.
 */
async function ask(cdp, question, timeoutMs = 45000) {
  return cdp.eval(async (q, budget) => {
    const sleep = (m) => new Promise((r) => setTimeout(r, m));
    const botBubbles = () => [...document.querySelectorAll('div')]
      .filter((d) => {
        const s = getComputedStyle(d);
        return s.display === 'flex' && s.justifyContent === 'flex-start' && (d.textContent || '').trim();
      })
      .map((d) => (d.textContent || '').trim());

    const ta = document.querySelector('textarea[placeholder*="Ask about"]');
    if (!ta) return { ok: false, why: 'chat panel not open' };
    const before = botBubbles().length;

    // The framework owns the textarea's value, so assigning .value is ignored.
    // Go through the native setter and fire a bubbling input event.
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, q);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(150);

    const send = [...document.querySelectorAll('button')].find((b) => /^send$/i.test((b.textContent || '').trim()));
    if (!send) return { ok: false, why: 'no Send button' };
    send.click();

    const started = Date.now();
    while (Date.now() - started < budget) {
      await sleep(400);
      const bubbles = botBubbles();
      if (bubbles.length > before) {
        const reply = bubbles[bubbles.length - 1];
        if (reply && !/^thinking/i.test(reply)) {
          return { ok: true, reply: reply.slice(0, 600), ms: Date.now() - started };
        }
      }
    }
    return { ok: false, why: `no assistant bubble within ${budget}ms` };
  }, question, timeoutMs);
}

/** The counter is a separate async fetch — absent for several seconds after the swap. */
async function waitForCounter(cdp, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const v = await cdp.eval(() => (document.body.innerText.match(/[\d,]+\s*visitors?/i) || [null])[0]);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function shot(cdp, out) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(data, 'base64'));
  return out;
}

const readConfig = async () => {
  const js = await readFile(join(SITE, 'assets/config.js'), 'utf8');
  return (js.match(/window\.PORTFOLIO_API\s*=\s*'([^']*)'/) || [, ''])[1];
};

/* -------------------------------------------------------------- commands */

async function cmdApi() {
  const api = await readConfig();
  if (!api) die('assets/config.js has an empty PORTFOLIO_API — nothing to test');
  log(`worker: ${api}\n`);
  const call = async (label, path, init = {}) => {
    const res = await fetch(api + path, init).catch((e) => ({ status: 0, text: async () => e.message }));
    const body = (await res.text()).slice(0, 160);
    log(`  ${String(res.status).padEnd(4)} ${label}\n       ${body}`);
    return res.status;
  };
  const H = { 'content-type': 'application/json', origin: 'https://dotbion.github.io' };
  await call('POST /api/visit  (correct origin)', '/api/visit', { method: 'POST', headers: H, body: '{}' });
  await call('POST /api/chat   (correct origin)', '/api/chat', {
    method: 'POST', headers: H,
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Where does Nobodit study?' }] }),
  });
  const forbidden = await call('POST /api/chat   (NO origin — must be 403)', '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  const unauth = await call('GET  /api/logs   (no key — must be 401)', '/api/logs');
  if (forbidden !== 403) log('\n  WARNING: /api/chat is callable without an Origin header.');
  if (unauth !== 401) log('\n  WARNING: /api/logs is not key-gated.');
}

async function main() {
  const [cmd = 'smoke', ...rest] = process.argv.slice(2);

  if (cmd === 'api') return cmdApi();

  if (cmd === 'serve') {
    await startServer();
    log(`serving ${SITE} at ${ORIGIN} — Ctrl-C to stop`);
    return new Promise(() => {});
  }

  const server = await startServer();
  const cdp = await CDP.attach();
  let failed = false;
  try {
    if (cmd === 'shot') {
      const ms = await open(cdp);
      const out = resolve(rest[0] || join(SHOTS, 'site.png'));
      log(`loaded (swap took ${ms}ms) -> ${await shot(cdp, out)}`);

    } else if (cmd === 'chat') {
      const q = rest.join(' ') || 'Summarize Nobodit for a recruiter';
      await open(cdp);
      const opened = await openChat(cdp);
      if (!opened.ok) die(opened.why);
      const r = await ask(cdp, q);
      if (!r.ok) die(r.why);
      log(`Q: ${q}\nA: ${r.reply}\n(${r.ms}ms)`);

    } else if (cmd === 'smoke') {
      const api = await readConfig();
      log(`site   ${SITE}`);
      log(`worker ${api || '(unset — chat will be dormant)'}\n`);

      const ms = await open(cdp);
      log(`  ok   bundle swapped + rendered (${ms}ms)`);

      const counter = await waitForCounter(cdp);
      if (counter) log(`  ok   counter renders: "${counter}"`);
      else { failed = true; log('  FAIL counter never rendered (worker down, or PORTFOLIO_API unset)'); }

      const opened = await openChat(cdp);
      log(opened.ok ? '  ok   chat panel opens' : `  FAIL chat panel: ${opened.why}`);
      if (!opened.ok) failed = true;

      if (opened.ok) {
        // A reply bubble is not the same as a working chat: the design renders
        // its own "something went wrong" text as an assistant bubble, and the
        // Worker returns friendly copy for 429/502 too. Treat those as failures.
        const BROKEN = /unavailable right now|Too many messages|something went wrong/i;
        const r = await ask(cdp, 'What ML systems has Nobodit built?');
        if (r.ok && !BROKEN.test(r.reply)) {
          log(`  ok   chat replied in ${r.ms}ms: ${r.reply.slice(0, 90)}...`);
        } else {
          failed = true;
          log(`  FAIL chat: ${r.ok ? r.reply.slice(0, 120) : r.why}`);
          log('       (rate limit = 15/10min per IP; Gemini free tier = 500/day)');
        }
      }

      const out = await shot(cdp, join(SHOTS, 'smoke.png'));
      log(`  ok   screenshot -> ${out}`);
      log(failed ? '\nSMOKE FAILED' : '\nSMOKE PASSED');

    } else {
      die(`unknown command "${cmd}". Use: smoke | shot | chat | api | serve`);
    }
  } finally {
    await cdp.close();
    server.close();
  }
  if (failed) process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
