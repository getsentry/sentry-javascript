import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { markdownTable } from 'markdown-table';

const HEADING = '## 🔦 Lighthouse Report';
const MODES = ['no-sentry', 'init-only', 'tracing-replay'];

/**
 * Apps and their human-readable SDK labels, matching lighthouse-matrix.mjs.
 * Order here determines row order in each table.
 */
// Must mirror lighthouse-matrix.mjs APPS. angular, remix, ember, solidstart are
// intentionally excluded — see note in lighthouse-matrix.mjs.
const APPS = [
  { app: 'default-browser', sdk: 'browser' },
  { app: 'react-19', sdk: 'react' },
  { app: 'vue-3', sdk: 'vue' },
  { app: 'svelte-5', sdk: 'svelte' },
  { app: 'sveltekit-2', sdk: 'sveltekit' },
  { app: 'astro-5', sdk: 'astro' },
  { app: 'react-router-7-spa', sdk: 'react-router' },
  { app: 'tanstackstart-react', sdk: 'tanstack-start' },
  { app: 'nextjs-16', sdk: 'nextjs' },
  { app: 'nuxt-5', sdk: 'nuxt' },
];

/**
 * Metrics surfaced in the report. Lighthouse's category score is too coarse on its own
 * (fast static apps cap at 100 across all modes), so we also report the underlying
 * metric values. LCP is the primary regression indicator for SDK overhead; TBT captures
 * runtime cost of instrumentation; total bytes captures download cost.
 */
const SECTIONS = [
  { label: 'Performance score', metric: 'score', unit: '', betterIs: 'higher' },
  { label: 'Largest Contentful Paint (LCP)', metric: 'lcp', unit: ' ms', betterIs: 'lower' },
  { label: 'Total Blocking Time (TBT)', metric: 'tbt', unit: ' ms', betterIs: 'lower' },
  { label: 'Bytes downloaded', metric: 'bytes', unit: ' KB', betterIs: 'lower' },
];

/**
 * Read the median-run LHR from an LHCI artifact directory.
 * Returns { score, lcp, tbt, bytes } or null if missing/invalid.
 */
async function readResult(resultsDir, app, mode) {
  const dir = path.join(resultsDir, `lighthouse-${app}-${mode}`);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }

  // LHCI manifest is an array of entries. Pick the representative one
  // (aggregationMethod: median-run) or fall back to the first entry.
  const entry = manifest.find(e => e.isRepresentativeRun) || manifest[0];
  if (!entry) return null;

  const lhrPath = path.join(dir, path.basename(entry.jsonPath));
  let lhr;
  try {
    lhr = JSON.parse(await fs.readFile(lhrPath, 'utf8'));
  } catch {
    return null;
  }

  const score = lhr.categories?.performance?.score;
  if (score == null) return null;

  const audit = id => lhr.audits?.[id]?.numericValue;
  const round = v => (typeof v === 'number' ? Math.round(v) : undefined);

  return {
    score: Math.round(score * 100),
    lcp: round(audit('largest-contentful-paint')),
    tbt: round(audit('total-blocking-time')),
    bytes: round(audit('total-byte-weight') / 1024),
  };
}

function formatValue(value, unit) {
  if (value == null || Number.isNaN(value)) return '⚠️';
  return `${value}${unit}`;
}

function formatDelta(before, after, unit) {
  if (before == null || after == null || Number.isNaN(before) || Number.isNaN(after)) {
    return '—';
  }
  const diff = after - before;
  if (diff === 0) return '0';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff}${unit}`;
}

function buildSectionTable(rows, metric, unit) {
  const header = ['App', 'No Sentry', 'Init Only', 'Δ (SDK)', 'Tracing+Replay', 'Δ (Features)'];
  const body = rows.map(({ sdk, results }) => {
    const n = results['no-sentry']?.[metric];
    const i = results['init-only']?.[metric];
    const t = results['tracing-replay']?.[metric];
    return [
      sdk,
      formatValue(n, unit),
      formatValue(i, unit),
      formatDelta(n, i, unit),
      formatValue(t, unit),
      formatDelta(i, t, unit),
    ];
  });
  return markdownTable([header, ...body]);
}

async function run() {
  const resultsDir = process.env.LIGHTHOUSE_RESULTS_DIR || 'lighthouse-results';
  const isPR = process.env.IS_PR === 'true';
  const prNumber = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : undefined;

  const rows = [];
  let totalCells = 0;
  let filledCells = 0;

  for (const { app, sdk } of APPS) {
    const results = {};
    for (const mode of MODES) {
      totalCells++;
      results[mode] = await readResult(resultsDir, app, mode);
      if (results[mode]) filledCells++;
    }
    rows.push({ sdk, results });
  }

  if (totalCells > 0 && filledCells / totalCells < 0.5) {
    core.warning(`Only ${filledCells}/${totalCells} Lighthouse cells have results (< 50%). Skipping comment.`);
    return;
  }

  // Build one table per metric so each metric's deltas are clearly readable.
  // Performance score is generous (fast static apps top out at 100 across all modes),
  // so the LCP / TBT / Bytes tables are typically the real signal.
  const tables = SECTIONS.map(
    ({ label, metric, unit }) => `### ${label}\n\n${buildSectionTable(rows, metric, unit)}`,
  ).join('\n\n');

  const footer =
    '\n\n_Median of 5 runs · simulated throttling · localhost. ' +
    'Lower is better for LCP, TBT, and bytes. Higher is better for score. ' +
    'Full reports are attached as workflow artifacts (`lighthouse-<app>-<mode>`)._';

  const body = `${HEADING}\n\n${tables}${footer}`;

  if (!isPR || !prNumber) {
    // Nightly / non-PR: log to stdout (captured in workflow logs)
    // eslint-disable-next-line no-console
    console.log(body);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning('GITHUB_TOKEN not set — cannot post PR comment.');
    return;
  }

  const octokit = getOctokit(token);
  const repo = context.repo;

  // Find existing Lighthouse comment to update (mirror size-limit-gh-action pattern)
  const { data: comments } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number: prNumber,
  });
  const existing = comments.find(c => c.body?.startsWith(HEADING));

  try {
    if (existing) {
      await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: existing.id,
        body,
      });
      core.info('Updated existing Lighthouse comment.');
    } else {
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: prNumber,
        body,
      });
      core.info('Created Lighthouse PR comment.');
    }
  } catch (err) {
    if (err.status === 403) {
      // Fork PRs: GITHUB_TOKEN is read-only. Log the table to the workflow log so the
      // data is still discoverable, and exit 0 so the job doesn't fail.
      core.warning(
        'Could not post PR comment (403 Forbidden). This is expected for fork PRs where GITHUB_TOKEN is read-only.',
      );
      // eslint-disable-next-line no-console
      console.log(`\n${body}`);
      return;
    }
    throw err;
  }
}

run().catch(err => {
  core.setFailed(err.message);
  process.exit(1);
});
