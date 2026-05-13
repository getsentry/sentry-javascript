/**
 * Bundle the instrumented Sentry test apps for every (app, mode) cell and POST
 * the tarballs to the Sentry Lighthouse lab (https://lighthouse.sentry.gg). The
 * lab runs Lighthouse asynchronously and ships results to Sentry on its own
 * schedule — this script exits as soon as the upload succeeds, it does NOT wait
 * for the lab to finish.
 *
 * Wire protocol: ~/Projects/sentry-lhci/docs/sentry-javascript-handoff.md
 *
 * Zero runtime dependencies — uses Node 22 builtins (fetch, FormData, Blob) and
 * the system `tar`. Every external command is invoked via `execFileSync` with
 * an argv array so no shell interpolation happens — needed both for safety
 * (CodeQL flags any env-derived string concatenated into a shell command, even
 * when the inputs are controlled) and to keep paths with spaces working.
 */

/* eslint-disable no-console */

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LAB_URL = process.env.LIGHTHOUSE_LAB_URL;
const TOKEN = process.env.LIGHTHOUSE_UPLOAD_TOKEN;
if (!LAB_URL || !TOKEN) {
  throw new Error('LIGHTHOUSE_LAB_URL and LIGHTHOUSE_UPLOAD_TOKEN must be set');
}

const WORKSPACE = process.env.GITHUB_WORKSPACE ?? process.cwd();
const RUNNER_TEMP = process.env.RUNNER_TEMP ?? path.join(WORKSPACE, '.tmp');
const PACKED_DIR = path.join(WORKSPACE, 'dev-packages/e2e-tests/packed');
const E2E_DIR = path.join(WORKSPACE, 'dev-packages/e2e-tests');

/**
 * The matrix. Adding an app here requires:
 *   1. The test app reads SENTRY_LIGHTHOUSE_MODE (or its bundler-specific
 *      prefix variant) and branches its Sentry init.
 *   2. For SSR apps, the lab's runner must accept a startCmd + readyPattern.
 */
const APPS = [
  { app: 'default-browser', serve: 'static', staticDir: 'build' },
  { app: 'react-19', serve: 'static', staticDir: 'build' },
  {
    app: 'nextjs-16',
    serve: 'server',
    startCmd: 'pnpm start',
    readyPattern: 'Ready in',
    // Lab side: pnpm 9.15.9 is on the image via corepack. We strip the lockfile
    // and devDependencies from the SSR bundle (CI generates the lockfile with
    // workspace-absolute paths that don't survive the move; devDeps include
    // workspace links like @sentry-internal/test-utils that would also fail).
    // --no-frozen-lockfile lets pnpm regenerate from the rewritten package.json,
    // --prefer-offline uses the lab's persistent pnpm store (/data/.pnpm-store).
    installCmd: 'pnpm install --no-frozen-lockfile --prefer-offline',
  },
];

const MODES = ['no-sentry', 'init-only', 'tracing-replay'];

async function run() {
  // Fail fast if the lab is down so we don't waste minutes building bundles.
  console.log(`Liveness check: ${LAB_URL}/healthz`);
  const health = await fetch(`${LAB_URL}/healthz`);
  if (!health.ok) {
    throw new Error(`Lab healthcheck failed: ${health.status} ${await health.text()}`);
  }
  console.log('Lab is reachable.');

  await mkdir(path.join(RUNNER_TEMP, 'bundles'), { recursive: true });
  const bundles = [];

  for (const def of APPS) {
    for (const mode of MODES) {
      const fieldName = `bundle-${bundles.length}`;
      console.log(`\n=== Preparing ${def.app} (${mode}) → ${fieldName} ===`);
      const bundle = await prepareCell(def, mode, fieldName);
      bundles.push(bundle);
    }
  }

  console.log(`\n=== Uploading ${bundles.length} bundles to ${LAB_URL}/api/builds ===`);
  const buildResp = await uploadBundles(bundles);
  console.log(`Build queued: ${buildResp.buildId}`);
  console.log(`Dashboard:    ${LAB_URL}${buildResp.dashboardUrl}`);
  console.log(`API:          ${LAB_URL}${buildResp.buildUrl}`);
  console.log('\nUpload succeeded. The lab runs Lighthouse asynchronously — track results in the Sentry dashboard.');
}

/**
 * Build a single (app, mode) cell:
 *   1. Copy the app to a unique temp dir (concurrent cells can't collide).
 *   2. Apply pnpm overrides (existing helper).
 *   3. Run `pnpm test:build` with SENTRY_LIGHTHOUSE_MODE + the framework
 *      prefix variants (NEXT_PUBLIC_*, REACT_APP_*) — each app's bundler picks
 *      up whichever it knows about.
 *   4. Static cells: tar just the build dir.
 *      SSR cells: copy packed tgzs into the bundle, rewrite package.json to
 *      relative `file:./packed/...` paths, drop devDependencies, tar without
 *      node_modules and the lockfile.
 *   5. Return cell metadata for the upload.
 */
async function prepareCell(def, mode, fieldName) {
  const tempApp = path.join(RUNNER_TEMP, `app-${def.app}-${mode}`);
  await rm(tempApp, { recursive: true, force: true });

  // Copy app to temp (fixes file:/link: deps to workspace-absolute paths)
  execFileSync('yarn', ['ci:copy-to-temp', `./test-applications/${def.app}`, tempApp], {
    cwd: E2E_DIR,
    stdio: 'inherit',
  });

  // Add pnpm overrides (workspace-absolute paths pointing at packed dir)
  execFileSync('yarn', ['ci:pnpm-overrides', tempApp, PACKED_DIR], {
    cwd: E2E_DIR,
    stdio: 'inherit',
  });

  // Build with the right mode env var. We set all common bundler prefixes so each
  // app's bundler picks up whichever variant it knows about — apps that don't read
  // a prefix simply ignore extra vars.
  execFileSync('pnpm', ['test:build'], {
    cwd: tempApp,
    stdio: 'inherit',
    env: {
      ...process.env,
      SENTRY_E2E_WORKSPACE_ROOT: WORKSPACE,
      SENTRY_LIGHTHOUSE_MODE: mode,
      NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE: mode,
      REACT_APP_SENTRY_LIGHTHOUSE_MODE: mode,
    },
  });

  const tarPath = path.join(RUNNER_TEMP, 'bundles', `${def.app}-${mode}.tar.gz`);

  if (def.serve === 'static') {
    // Static cell — tar just the build dir. Lab serves it with a static HTTP server.
    execFileSync('tar', ['-czf', tarPath, '-C', tempApp, def.staticDir], { stdio: 'inherit' });
    console.log(`Static bundle: ${tarPath} (${await formatSize(tarPath)})`);
    return {
      fieldName,
      tarPath,
      cell: {
        app: def.app,
        mode,
        bundleField: fieldName,
        serve: 'static',
        staticDir: def.staticDir,
      },
    };
  }

  // SSR cell — prep for `pnpm install && pnpm start` on the lab.
  await prepareSsrBundle(tempApp);
  execFileSync(
    'tar',
    [
      '-czf',
      tarPath,
      '--exclude=node_modules',
      '--exclude=.git',
      '--exclude=pnpm-lock.yaml',
      '-C',
      path.dirname(tempApp),
      path.basename(tempApp),
    ],
    { stdio: 'inherit' },
  );
  console.log(`SSR bundle: ${tarPath} (${await formatSize(tarPath)})`);
  return {
    fieldName,
    tarPath,
    cell: {
      app: def.app,
      mode,
      bundleField: fieldName,
      serve: 'server',
      startCmd: def.startCmd,
      readyPattern: def.readyPattern,
      installCmd: def.installCmd,
    },
  };
}

/**
 * For SSR cells: copy the packed Sentry tarballs into the bundle, rewrite
 * package.json deps + pnpm.overrides to relative `file:./packed/...` paths so
 * the lab's `pnpm install` can resolve them from inside the extracted bundle,
 * and drop devDependencies entirely (not needed at runtime; some are workspace
 * links like @sentry-internal/test-utils that don't survive the move).
 */
async function prepareSsrBundle(tempApp) {
  // Copy packed tgz files into <bundle>/packed/
  const inBundlePacked = path.join(tempApp, 'packed');
  await mkdir(inBundlePacked, { recursive: true });
  for (const name of await readdir(PACKED_DIR)) {
    if (name.endsWith('.tgz')) {
      await copyFile(path.join(PACKED_DIR, name), path.join(inBundlePacked, name));
    }
  }

  // Rewrite all workspace-absolute `file:.../sentry-*-packed.tgz` references in
  // package.json to `./packed/<file>`, and drop devDependencies wholesale.
  const pkgPath = path.join(tempApp, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const rewrite = obj => {
    if (!obj) return;
    for (const [name, val] of Object.entries(obj)) {
      const m = typeof val === 'string' ? val.match(/sentry-[a-z0-9-]+-packed\.tgz$/) : null;
      if (m && (val.startsWith('file:') || val.startsWith('link:'))) {
        obj[name] = `file:./packed/${m[0]}`;
      }
    }
  };
  rewrite(pkg.dependencies);
  rewrite(pkg.pnpm?.overrides);
  delete pkg.devDependencies;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
}

/**
 * POST the multipart form. Returns the parsed 202 response body.
 */
async function uploadBundles(bundles) {
  const metadata = {
    commit: process.env.GITHUB_SHA ?? 'unknown',
    branch: process.env.GITHUB_REF_NAME ?? 'unknown',
    triggeredBy: 'github-actions',
    workflowRunUrl:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined,
    cells: bundles.map(b => b.cell),
  };

  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  for (const b of bundles) {
    const buf = await readFile(b.tarPath);
    form.append(b.fieldName, new Blob([buf], { type: 'application/gzip' }), path.basename(b.tarPath));
  }

  const res = await fetch(`${LAB_URL}/api/builds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function formatSize(filePath) {
  const { size } = await stat(filePath);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

run().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
