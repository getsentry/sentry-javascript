// Loads the CDN bundles in the oldest Chromium we support and checks that the web vitals it can
// measure are sent, and that nothing throws. Playwright only drives the Chromium it ships with, so
// this talks to the browser over the DevTools protocol directly and needs no dependencies. Run it after
// `pnpm build:bundle` in `packages/browser`.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chromium 80.0.3987.0, the minimum Chrome version in our supported browsers docs.
const CHROMIUM_REVISION = '722234';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const CHROMIUM_DIR = path.join(DIR, '.chromium', CHROMIUM_REVISION);
const CHROME = path.join(CHROMIUM_DIR, 'chrome-linux', 'chrome');
const BUNDLES_DIR = path.join(DIR, '../../packages/browser/build/bundles');
const BUNDLES = [
  'bundle.tracing.min.js',
  // The debug build logs errors the SDK catches internally, which would otherwise go unnoticed.
  'bundle.tracing.replay.feedback.logs.metrics.debug.min.js',
];
const PAGE = readFileSync(path.join(DIR, 'page.html'), 'utf8');

// What Chromium 80 can report. CLS is skipped there because web-vitals' CLS code needs
// `Array.prototype.at` (Chromium 92), and INP needs `PerformanceEventTiming.interactionId` (Chromium 96).
const EXPECTED_PAGELOAD_VITALS = ['fcp', 'fp', 'ttfb'];
const UNEXPECTED_SPAN_OPS = ['ui.webvital.cls', 'ui.interaction.click'];

async function ensureChromium() {
  if (existsSync(CHROME)) {
    return;
  }
  const url = `https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${CHROMIUM_REVISION}/chrome-linux.zip`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Downloading Chromium failed: ${response.status} ${url}`);
  }
  const zip = path.join(tmpdir(), `chromium-${CHROMIUM_REVISION}.zip`);
  writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  mkdirSync(CHROMIUM_DIR, { recursive: true });
  execFileSync('unzip', ['-q', zip, '-d', CHROMIUM_DIR]);
  rmSync(zip);
}

// The page is served from 127.0.0.1 and the DSN points at localhost, so envelopes are sent cross-origin like
// they are to sentry.io.
function startServer(bundlePath, envelopes) {
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/api/1337/envelope/')) {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        envelopes.push(body);
        res.setHeader('access-control-allow-origin', '*');
        res.end('{}');
      });
      return;
    }
    if (req.url === '/bundle.js') {
      res.setHeader('content-type', 'text/javascript');
      res.end(readFileSync(bundlePath));
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(PAGE.replace('__DSN__', `http://public@localhost:${server.address().port}/1337`));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launchChrome(userDataDir) {
  const chrome = spawn(CHROME, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=0',
    '--window-size=800,1200',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);
  const port = new Promise((resolve, reject) => {
    let stderr = '';
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        resolve(match[1]);
      }
    });
    chrome.on('exit', code => reject(new Error(`Chromium exited with ${code}:\n${stderr}`)));
  });
  return { chrome, port };
}

async function connect(port) {
  // The DevTools server can come up before the initial page target exists.
  let page;
  for (let attempt = 0; !page && attempt < 50; attempt++) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    page = targets.find(target => target.type === 'page');
    if (!page) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!page) {
    throw new Error('Chromium has no page target');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let lastId = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) {
      listeners.forEach(listener => listener(message));
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++lastId, { resolve, reject });
      ws.send(JSON.stringify({ id: lastId, method, params }));
    });
  const waitFor = method => new Promise(resolve => listeners.push(message => message.method === method && resolve()));
  const evaluate = async expression => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(`Evaluating failed: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    }
    return result.value;
  };

  return { send, waitFor, evaluate, on: listener => listeners.push(listener), close: () => ws.close() };
}

function parseEnvelopes(envelopes) {
  const spans = [];
  const events = [];
  for (const envelope of envelopes) {
    const [, ...items] = envelope.split('\n').filter(Boolean);
    for (let i = 0; i < items.length; i += 2) {
      const header = JSON.parse(items[i]);
      const payload = JSON.parse(items[i + 1]);
      if (header.type === 'span') {
        spans.push(...payload.items);
      } else if (header.type === 'event') {
        events.push(payload);
      }
    }
  }
  return { spans, events };
}

const getOp = span => span.attributes['sentry.op']?.value;
const isPageload = span => span.is_segment && getOp(span) === 'pageload';

async function runBundle(bundle) {
  const envelopes = [];
  const errors = [];
  const server = await startServer(path.join(BUNDLES_DIR, bundle), envelopes);
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'chromium-profile-'));
  const { chrome, port } = launchChrome(userDataDir);
  let cdp;

  try {
    cdp = await connect(await port);
    cdp.on(({ method, params }) => {
      if (method === 'Runtime.exceptionThrown') {
        errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        errors.push(params.args.map(arg => arg.value ?? arg.description).join(' '));
      } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
        errors.push(params.entry.text);
      }
    });
    await Promise.all([cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Page.enable')]);

    const loaded = cdp.waitFor('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await loaded;

    // Layout shifts, then a click: shifts within 500ms after an input don't count towards CLS.
    await cdp.evaluate(`(async () => {
      const element = document.getElementById('shift');
      for (let i = 1; i <= 10; i++) {
        element.style.top = 200 + i * 40 + 'px';
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    })()`);
    const { x, y } = await cdp.evaluate(`(() => {
      const rect = document.getElementById('button').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
    await new Promise(resolve => setTimeout(resolve, 300));

    // Without these, the checks that CLS and INP are not sent would pass without testing anything.
    const { layoutShifts, clicked } = await cdp.evaluate(`new Promise(resolve => {
      const done = layoutShifts => resolve({ layoutShifts, clicked: document.getElementById('button').dataset.clicked === 'true' });
      new PerformanceObserver(list => done(list.getEntries().length)).observe({ type: 'layout-shift', buffered: true });
      setTimeout(() => done(0), 500);
    })`);
    if (!layoutShifts || !clicked) {
      throw new Error(`Page did not shift (${layoutShifts} layout shifts) or was not clicked (${clicked})`);
    }

    // Hiding the page is what makes the SDK finalize LCP and CLS.
    await cdp.evaluate(`(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    // The pageload span, which carries FCP, FP and TTFB, ends once the page has been idle for a second.
    const deadline = Date.now() + 10_000;
    while (!parseEnvelopes(envelopes).spans.some(isPageload) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    cdp?.close();
    chrome.kill();
    server.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }

  const { spans, events } = parseEnvelopes(envelopes);
  const pageload = spans.find(isPageload);
  const ops = new Set(spans.map(getOp));
  const failures = [...new Set(errors)].map(error => `page error: ${error}`);

  for (const event of events) {
    failures.push(`error event sent: ${event.exception?.values?.[0]?.value ?? event.message}`);
  }
  if (!pageload) {
    failures.push('no pageload span sent');
  } else {
    if (!pageload.attributes['user_agent.original']?.value.includes('Chrome/80.')) {
      failures.push(`not running in Chrome 80: ${pageload.attributes['user_agent.original']?.value}`);
    }
    for (const vital of EXPECTED_PAGELOAD_VITALS) {
      if (typeof pageload.attributes[`browser.web_vital.${vital}.value`]?.value !== 'number') {
        failures.push(`pageload span has no ${vital.toUpperCase()}`);
      }
    }
  }
  const lcp = spans.find(span => getOp(span) === 'ui.webvital.lcp');
  if (typeof lcp?.attributes['browser.web_vital.lcp.value']?.value !== 'number') {
    failures.push('no LCP span sent');
  }
  for (const unexpected of UNEXPECTED_SPAN_OPS) {
    if (ops.has(unexpected)) {
      failures.push(`unexpected ${unexpected} span sent`);
    }
  }

  return failures;
}

await ensureChromium();

const results = await Promise.all(BUNDLES.map(runBundle));
results.forEach((failures, index) => {
  // eslint-disable-next-line no-console
  console.log(
    `${failures.length ? '✘' : '✓'} ${BUNDLES[index]}${failures.map(failure => `\n    ${failure}`).join('')}`,
  );
});
process.exitCode = results.some(failures => failures.length) ? 1 : 0;
