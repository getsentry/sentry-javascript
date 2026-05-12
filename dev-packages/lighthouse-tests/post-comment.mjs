import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { markdownTable } from 'markdown-table';

const HEADING = '## 🔦 Lighthouse Report';
const MODES = ['no-sentry', 'init-only', 'tracing-replay'];

/**
 * Apps and their human-readable SDK labels, matching lighthouse-matrix.mjs.
 * Order here determines row order in the table.
 */
const APPS = [
  { app: 'default-browser', sdk: 'browser' },
  { app: 'react-19', sdk: 'react' },
  { app: 'ember-classic', sdk: 'ember' },
  { app: 'create-remix-app-express', sdk: 'remix' },
  { app: 'angular-21', sdk: 'angular' },
  { app: 'vue-3', sdk: 'vue' },
  { app: 'svelte-5', sdk: 'svelte' },
  { app: 'sveltekit-2', sdk: 'sveltekit' },
  { app: 'astro-5', sdk: 'astro' },
  { app: 'react-router-7-spa', sdk: 'react-router' },
  { app: 'solidstart-spa', sdk: 'solidstart' },
  { app: 'tanstackstart-react', sdk: 'tanstack-start' },
  { app: 'nextjs-16', sdk: 'nextjs' },
  { app: 'nuxt-5', sdk: 'nuxt' },
];

/**
 * Read the median-run LHR from an LHCI artifact directory.
 * Returns { score, url } or null if missing/invalid.
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

  const url = entry.htmlPath ? entry.htmlPath : undefined;

  return { score: Math.round(score * 100), url };
}

function formatCell(result) {
  if (!result) return '⚠️';
  if (result.url) return `[${result.score}](${result.url})`;
  return `${result.score}`;
}

function formatDelta(a, b) {
  if (!a || !b) return '—';
  const diff = b.score - a.score;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff}`;
}

async function run() {
  const resultsDir = process.env.LIGHTHOUSE_RESULTS_DIR || 'lighthouse-results';
  const isPR = process.env.IS_PR === 'true';
  const prNumber = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : undefined;

  // Collect all results
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

  // If <50% of cells have data, warn and skip
  if (totalCells > 0 && filledCells / totalCells < 0.5) {
    core.warning(`Only ${filledCells}/${totalCells} Lighthouse cells have results (< 50%). Skipping comment.`);
    return;
  }

  // Build markdown table
  const header = ['App', 'No Sentry', 'Init Only', 'Δ (SDK)', 'Tracing+Replay', 'Δ (Features)'];
  const tableRows = rows.map(({ sdk, results }) => [
    sdk,
    formatCell(results['no-sentry']),
    formatCell(results['init-only']),
    formatDelta(results['no-sentry'], results['init-only']),
    formatCell(results['tracing-replay']),
    formatDelta(results['init-only'], results['tracing-replay']),
  ]);

  const table = markdownTable([header, ...tableRows]);

  if (!isPR || !prNumber) {
    // Nightly / non-PR: just log to stdout
    // eslint-disable-next-line no-console
    console.log(`${HEADING}\n\n${table}`);
    return;
  }

  // Post or update PR comment
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning('GITHUB_TOKEN not set — cannot post PR comment.');
    return;
  }

  const octokit = getOctokit(token);
  const repo = context.repo;

  // Find existing comment
  const { data: comments } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number: prNumber,
  });
  const existing = comments.find(c => c.body?.startsWith(HEADING));

  const body = `${HEADING}\n\n${table}`;

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
