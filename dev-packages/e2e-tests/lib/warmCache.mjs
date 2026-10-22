/* eslint-disable no-console */
// Installs the dependencies of every test application, so the pnpm store and metadata cache on the E2E cache volume
// hold them. See .github/workflows/warm-e2e-cache.yml.
// Usage: node lib/warmCache.mjs install <dir to install the apps in> [concurrency]
//        node lib/warmCache.mjs verify <same dir> [concurrency]
// `verify` reinstalls every app that `install` installed from the store alone, and fails if the store misses a package.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.join(__dirname, '..');
const appsDir = path.join(e2eDir, 'test-applications');
const packedDir = path.join(e2eDir, 'packed');
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const INSTALLED_FILE = 'installed.json';

function run(command, args, options) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), INSTALL_TIMEOUT_MS);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function warmApp(app, workDir) {
  const appDir = path.join(workDir, app);
  const start = Date.now();
  const steps = [
    ['node', ['ciCopyToTemp.mjs', path.join(appsDir, app), appDir], { cwd: e2eDir }],
    ['node', ['ciPnpmOverrides.mjs', appDir, packedDir], { cwd: e2eDir }],
    // Without scripts, so nothing is built: only the downloads are needed.
    ['pnpm', ['install', '--ignore-scripts'], { cwd: appDir }],
  ];
  for (const [command, args, options] of steps) {
    const { code, output } = await run(command, args, options);
    if (code !== 0) {
      return { app, ok: false, seconds: (Date.now() - start) / 1000, output };
    }
  }
  return { app, ok: true, seconds: (Date.now() - start) / 1000 };
}

async function verifyApp(app, workDir) {
  const appDir = path.join(workDir, app);
  const start = Date.now();
  fs.rmSync(path.join(appDir, 'node_modules'), { recursive: true, force: true });
  const { code, output } = await run('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], {
    cwd: appDir,
  });
  return { app, ok: code === 0, seconds: (Date.now() - start) / 1000, output };
}

async function runAll(apps, concurrency, task) {
  const pending = [...apps];
  const results = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (pending.length > 0) {
        const result = await task(pending.shift());
        results.push(result);
        console.log(`${result.ok ? 'ok' : 'FAILED'} ${result.app} (${result.seconds.toFixed(0)} s)`);
        if (!result.ok) {
          console.log(result.output.split('\n').slice(-20).join('\n'));
        }
      }
    }),
  );
  return results;
}

async function install(workDir, concurrency) {
  const apps = fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(appsDir, entry.name, 'package.json')))
    .map(entry => entry.name)
    .filter(app => !JSON.parse(fs.readFileSync(path.join(appsDir, app, 'package.json'), 'utf8')).sentryTest?.skip)
    .sort();
  console.log(`Installing ${apps.length} test applications, ${concurrency} at a time.`);

  const results = await runAll(apps, concurrency, app => warmApp(app, workDir));

  const failed = results.filter(result => !result.ok);
  console.log(`${results.length - failed.length} of ${results.length} test applications installed.`);
  fs.writeFileSync(
    path.join(workDir, INSTALLED_FILE),
    JSON.stringify(results.filter(result => result.ok).map(result => result.app)),
  );
  for (const { app } of failed) {
    console.log(`::warning::Could not install ${app}, so its dependencies may not be cached.`);
  }
  // A few apps failing to resolve leaves the others cached. Most failing means the setup is broken.
  if (failed.length > results.length / 2) {
    process.exitCode = 1;
  }
}

async function verify(workDir, concurrency) {
  const apps = JSON.parse(fs.readFileSync(path.join(workDir, INSTALLED_FILE), 'utf8'));
  console.log(`Reinstalling ${apps.length} test applications from the store, ${concurrency} at a time.`);

  const results = await runAll(apps, concurrency, app => verifyApp(app, workDir));

  const failed = results.filter(result => !result.ok);
  console.log(`${results.length - failed.length} of ${results.length} test applications reinstalled offline.`);
  for (const { app } of failed) {
    console.log(`::error::${app} could not be installed from the store alone.`);
  }
  if (apps.length === 0 || failed.length > 0) {
    process.exitCode = 1;
  }
}

const [mode, workDir, concurrency = '4'] = process.argv.slice(2);
if (!workDir || !['install', 'verify'].includes(mode)) {
  throw new Error('Usage: node lib/warmCache.mjs <install|verify> <dir> [concurrency]');
}
await (mode === 'install' ? install : verify)(workDir, Number(concurrency));
