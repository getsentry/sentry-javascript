/**
 * Bundle the `lighthouse-react` test app for each mode (no-sentry, init-only,
 * tracing-replay) and POST the three tarballs to the Sentry Lighthouse lab
 * (https://lighthouse.sentry.gg). The lab runs Lighthouse asynchronously and
 * ships results to Sentry on its own schedule — this script exits as soon as
 * the upload succeeds.
 *
 * Single-app static matrix: 1 app × 3 modes = 3 cells.
 * See plan scratchpad #182 for design details.
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
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
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

const APP = 'lighthouse-react';
const APP_DIR = 'lighthouse-react';
const MODES = ['no-sentry', 'init-only', 'tracing-replay'];
const STATIC_DIR = 'dist';

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

  for (const mode of MODES) {
    const fieldName = `bundle-${bundles.length}`;
    console.log(`\n=== Preparing ${APP} (${mode}) → ${fieldName} ===`);
    bundles.push(await prepareCell(mode, fieldName));
  }

  console.log(`\n=== Uploading ${bundles.length} bundles to ${LAB_URL}/api/builds ===`);
  const buildResp = await uploadBundles(bundles);
  console.log(`Build queued: ${buildResp.buildId}`);
  console.log(`Dashboard:    ${LAB_URL}${buildResp.dashboardUrl}`);
  console.log(`API:          ${LAB_URL}${buildResp.buildUrl}`);
  console.log('\nUpload succeeded. The lab runs Lighthouse asynchronously — track results in the Sentry dashboard.');
}

/**
 * Build a single (mode) cell:
 *   1. Copy the app to a unique temp dir.
 *   2. Apply pnpm overrides (existing helper).
 *   3. Run `pnpm install` then `pnpm build:<mode>`.
 *   4. Tar the `dist/` output dir.
 *   5. Return cell metadata for the upload.
 */
async function prepareCell(mode, fieldName) {
  const tempApp = path.join(RUNNER_TEMP, `app-${APP}-${mode}`);
  await rm(tempApp, { recursive: true, force: true });

  // Copy app to temp (fixes file:/link: deps to workspace-absolute paths)
  execFileSync('yarn', ['ci:copy-to-temp', `./test-applications/${APP_DIR}`, tempApp], {
    cwd: E2E_DIR,
    stdio: 'inherit',
  });

  // Add pnpm overrides (workspace-absolute paths pointing at packed dir)
  execFileSync('yarn', ['ci:pnpm-overrides', tempApp, PACKED_DIR], {
    cwd: E2E_DIR,
    stdio: 'inherit',
  });

  // Install deps
  execFileSync('pnpm', ['install'], { cwd: tempApp, stdio: 'inherit' });

  // Build with the Vite mode — mode selection lives inside the per-mode npm
  // script, no extra env vars needed for routing. VITE_E2E_TEST_DSN is passed
  // so the tracing-replay build's Sentry.init has a DSN at build time.
  execFileSync('pnpm', [`build:${mode}`], {
    cwd: tempApp,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_E2E_TEST_DSN: process.env.VITE_E2E_TEST_DSN ?? 'https://username@domain/123',
    },
  });

  const tarPath = path.join(RUNNER_TEMP, 'bundles', `${APP}-${mode}.tar.gz`);
  execFileSync('tar', ['-czf', tarPath, '-C', tempApp, STATIC_DIR], { stdio: 'inherit' });
  console.log(`Static bundle: ${tarPath} (${await formatSize(tarPath)})`);

  return {
    fieldName,
    tarPath,
    cell: { app: APP, mode, bundleField: fieldName, serve: 'static', staticDir: STATIC_DIR },
  };
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
