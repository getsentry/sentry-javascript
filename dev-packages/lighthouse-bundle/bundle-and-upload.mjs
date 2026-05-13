/**
 * Bundle the instrumented Sentry test apps for every (app, mode) cell, POST the
 * tarballs to the Sentry Lighthouse lab (https://lighthouse.sentry.gg), poll
 * until the lab finishes running Lighthouse, then write a Job Summary.
 *
 * This script runs inside .github/workflows/lighthouse.yml. It is the only
 * script that talks to the lab — see ~/Projects/sentry-lhci/docs/sentry-javascript-handoff.md
 * for the wire protocol.
 *
 * Zero runtime dependencies — uses Node 22 builtins (fetch, FormData, Blob)
 * and the system `tar` available on every ubuntu runner.
 */

/* eslint-disable no-console */

import { execSync } from 'node:child_process';
import { copyFile, readdir, readFile, mkdir, rm, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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
 *   1. The test app reads `<envVarName>` and branches its Sentry init.
 *   2. The lab's runner understands `serve` / `staticDir` / `startCmd` (it does).
 */
const APPS = [
  {
    app: 'default-browser',
    serve: 'static',
    staticDir: 'build',
    envVarName: 'SENTRY_LIGHTHOUSE_MODE',
  },
  {
    app: 'react-19',
    serve: 'static',
    staticDir: 'build',
    envVarName: 'REACT_APP_SENTRY_LIGHTHOUSE_MODE',
  },
  {
    app: 'nextjs-16',
    serve: 'server',
    startCmd: 'pnpm start',
    readyPattern: 'Ready in',
    // Lab side: pnpm 9.15.9 is on the image via corepack. We strip the lockfile
    // from the bundle (CI generates it with workspace-absolute override paths
    // that don't survive the move to the lab), so --no-frozen-lockfile lets pnpm
    // re-resolve from the rewritten package.json. --prefer-offline uses the
    // lab's persistent pnpm store (/data/.pnpm-store).
    installCmd: 'pnpm install --no-frozen-lockfile --prefer-offline',
    envVarName: 'NEXT_PUBLIC_SENTRY_LIGHTHOUSE_MODE',
  },
];

const MODES = ['no-sentry', 'init-only', 'tracing-replay'];

async function run() {
  // Fail fast if the lab is down before we waste minutes building bundles.
  console.log(`Liveness check: ${LAB_URL}/healthz`);
  const health = await fetch(`${LAB_URL}/healthz`);
  if (!health.ok) throw new Error(`Lab healthcheck failed: ${health.status} ${await health.text()}`);
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
  console.log(`Build URL: ${LAB_URL}${buildResp.buildUrl}`);
  console.log(`Dashboard:  ${LAB_URL}${buildResp.dashboardUrl}`);

  const final = await pollUntilDone(buildResp.buildId);
  await writeJobSummary(final);

  // Surface failure to CI when the lab marks the build failed or any cell failed.
  const failedCells = (final.cells ?? []).filter(c => c.status === 'failed');
  if (final.status === 'failed' || failedCells.length > 0) {
    console.error(`Build status=${final.status}, ${failedCells.length} cell(s) failed.`);
    process.exit(1);
  }
}

/**
 * Build a single (app, mode) cell:
 *   1. Copy the app to a unique temp dir (so concurrent cells don't collide).
 *   2. Apply pnpm overrides (existing helper).
 *   3. Run `pnpm test:build` with the right SENTRY_LIGHTHOUSE_MODE env vars.
 *   4. For static cells, tar just the build dir.
 *      For SSR cells, copy packed tgzs into the bundle, rewrite package.json
 *      to use relative `file:./packed/...` paths, then tar (no node_modules).
 *   5. Return cell metadata for the upload.
 */
async function prepareCell(def, mode, fieldName) {
  const tempApp = path.join(RUNNER_TEMP, `app-${def.app}-${mode}`);
  await rm(tempApp, { recursive: true, force: true });

  // 1. Copy app to temp (fixes file: deps to workspace-absolute paths)
  execSync(`yarn ci:copy-to-temp ./test-applications/${def.app} ${tempApp}`, {
    cwd: E2E_DIR,
    stdio: 'inherit',
  });

  // 2. Add pnpm overrides (workspace-absolute paths pointing at packed dir)
  execSync(`yarn ci:pnpm-overrides ${tempApp} ${PACKED_DIR}`, {
    cwd: E2E_DIR,
    stdio: 'inherit',
  });

  // 3. Build with the right mode env var. We set all common bundler prefixes so each
  // app's bundler picks up whichever variant it knows about — apps that don't read a
  // prefix simply ignore extra vars.
  execSync('pnpm test:build', {
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
    // Static cell — tar the build dir only. Lab serves it with a static HTTP server.
    execSync(`tar -czf ${tarPath} -C ${tempApp} ${def.staticDir}`, { stdio: 'inherit' });
    const bytes = Number(execSync(`wc -c < ${tarPath}`, { encoding: 'utf8' }).trim());
    console.log(`Static bundle: ${tarPath} (${formatBytes(bytes)})`);
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
  execSync(
    `tar -czf ${tarPath} --exclude=node_modules --exclude=.git --exclude=pnpm-lock.yaml ` +
      `-C ${path.dirname(tempApp)} ${path.basename(tempApp)}`,
    { stdio: 'inherit' },
  );
  const bytes = Number(execSync(`wc -c < ${tarPath}`, { encoding: 'utf8' }).trim());
  console.log(`SSR bundle: ${tarPath} (${formatBytes(bytes)})`);
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
 * For SSR cells: copy the packed Sentry tarballs into the bundle and rewrite
 * package.json deps + pnpm.overrides to relative `file:./packed/...` paths so
 * the lab's `pnpm install` can resolve them from inside the extracted bundle.
 *
 * `node_modules` and `pnpm-lock.yaml` are stripped by the tar exclude list —
 * the lab regenerates both.
 */
async function prepareSsrBundle(tempApp) {
  // Copy packed tgz files into <bundle>/packed/
  const inBundlePacked = path.join(tempApp, 'packed');
  await mkdir(inBundlePacked, { recursive: true });
  const entries = await readdir(PACKED_DIR);
  for (const name of entries) {
    if (!name.endsWith('.tgz')) continue;
    await copyFile(path.join(PACKED_DIR, name), path.join(inBundlePacked, name));
  }

  // Rewrite all workspace-absolute `file:.../sentry-*-packed.tgz` references in
  // package.json (in dependencies, devDependencies, pnpm.overrides) to point at
  // `./packed/<file>`.
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
  rewrite(pkg.devDependencies);
  rewrite(pkg.pnpm?.overrides);
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

/**
 * Poll GET /api/builds/:id every 15 seconds until status is terminal, or the
 * 25-minute ceiling is reached.
 */
async function pollUntilDone(buildId) {
  const deadline = Date.now() + 25 * 60 * 1000;
  while (Date.now() < deadline) {
    const r = await fetch(`${LAB_URL}/api/builds/${buildId}`);
    if (!r.ok) {
      console.warn(`Poll failed: ${r.status} ${await r.text()} — retrying`);
      await sleep(15000);
      continue;
    }
    const build = await r.json();
    const cells = build.cells ?? [];
    const done = cells.filter(c => c.status === 'completed').length;
    const failed = cells.filter(c => c.status === 'failed').length;
    console.log(`status=${build.status} cells=${done + failed}/${cells.length} (${failed} failed)`);
    if (build.status === 'completed' || build.status === 'failed') return build;
    await sleep(15000);
  }
  throw new Error(`Build ${buildId} did not finish within 25 minutes`);
}

/**
 * Append a markdown table of the results to $GITHUB_STEP_SUMMARY so it renders
 * on the workflow run page. Skipped when running locally.
 */
async function writeJobSummary(build) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  const cells = build.cells ?? [];
  const lines = [
    `## 🔦 Lighthouse — ${build.status}`,
    '',
    `- Build ID: \`${build.buildId}\``,
    `- Commit: \`${build.commit ?? 'unknown'}\``,
    `- Branch: \`${build.branch ?? 'unknown'}\``,
    `- Dashboard: ${LAB_URL}${build.buildUrl ?? `/api/builds/${build.buildId}`}`,
    '',
    '| App | Mode | Status | Median score | Runs | Report |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const c of cells) {
    const runs = c.runs ?? [];
    const scores = runs.map(r => r.performanceScore).filter(s => s != null);
    const median = scores.length === 0 ? '—' : computeMedian(scores).toFixed(2);
    const reportUrl = runs[0]?.reportUrl ? `[view](${LAB_URL}${runs[0].reportUrl})` : '—';
    lines.push(`| ${c.app} | ${c.mode} | ${c.status} | ${median} | ${runs.length} | ${reportUrl} |`);
  }
  lines.push('');
  await appendFile(out, `${lines.join('\n')}\n`);
}

function computeMedian(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

run().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
