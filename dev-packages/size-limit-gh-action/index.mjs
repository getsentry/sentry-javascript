import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import { markdownTable } from 'markdown-table';
import sizeConfig from '../../.size-limit.js';
import { getArtifactForBranch, getArtifactForCommit, waitForSizeCheck } from './utils/artifacts.mjs';
import { formatResults, getSizeIncreases, MAX_INCREASE_BYTES, parseResults } from './utils/results.mjs';

const OVERRIDE_LABEL = 'Accept Bundlesize Increase';
const RELEASE_BRANCH_PREFIX = 'prepare-release/';
const SIZE_LIMIT_HEADING = '## size-limit report 📦 ';
const ARTIFACT_NAME = 'size-limit-action';
const ACTION_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE_PATH = path.join(ACTION_DIRECTORY, 'size-limit-results.json');
const BASE_PR_WAIT_MS = 10 * 60_000;
const WORKFLOW_FILE = path.basename(process.env.GITHUB_WORKFLOW_REF.split('@')[0]);
const REPO_URL = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;

const NO_BASELINE_FAILURE = 'No baseline size measurements found. Re-run after the base build completes.';
const INCREASE_FAILURE =
  `One or more gzipped bundles increased by more than ${MAX_INCREASE_BYTES} bytes. ` +
  `If this increase is intentional, add the **${OVERRIDE_LABEL}** label to this PR to rerun and accept the check.`;

const artifactClient = new DefaultArtifactClient();

async function run() {
  // Only set on PRs, where it is the PR's base branch
  const comparisonBranch = core.getInput('comparison_branch');
  const githubToken = core.getInput('github_token');
  const octokit = getOctokit(githubToken);
  const pr = context.payload.pull_request;

  if (comparisonBranch && !pr) {
    throw new Error('No PR found. Only pull_request workflows are supported.');
  }

  const { stdout } = await getExecOutput('pnpm', ['exec', 'size-limit', '--json']);
  const current = parseResults(stdout);

  // PRs store their results too, so PRs stacked on top of them can use them as their baseline
  await uploadResults(current, { required: !comparisonBranch });

  if (!comparisonBranch) {
    return;
  }

  const mergedBaseSha = await getMergedBaseSha(octokit);
  const basePr = mergedBaseSha && (await findBasePr(octokit, mergedBaseSha));
  const baseline = await downloadBaseline(octokit, githubToken, { comparisonBranch, basePr });

  const hasIncrease = baseline ? getSizeIncreases(baseline.results, current, sizeConfig).length > 0 : false;
  const bodyParts = [SIZE_LIMIT_HEADING];
  let failure;

  if (baseline) {
    bodyParts.push(...(await describeBaseline(octokit, { baseline, mergedBaseSha, comparisonBranch, basePr })));
  }

  if (pr.head.ref.startsWith(RELEASE_BRANCH_PREFIX)) {
    // Release PRs target master, which has no baseline and would include every change since the last release anyway
    core.info('Release PR detected. Reporting bundle sizes without enforcing limits.');
  } else if (!baseline) {
    failure = NO_BASELINE_FAILURE;
    bodyParts.push(failure);
  } else if (hasIncrease && !(await hasLabel(octokit, pr, OVERRIDE_LABEL))) {
    failure = INCREASE_FAILURE;
  }

  bodyParts.push(markdownTable(formatResults(baseline?.results, current)));
  if (baseline) {
    bodyParts.push(`[View base workflow run](${baseline.workflowRun.html_url})`);
  }

  const body = bodyParts.join('\n\n');
  await core.summary.addRaw(body).write();
  await updatePrComments(octokit, pr, { body, failure });

  if (failure) {
    core.setFailed(failure);
  }
}

/**
 * `sha` is the commit that was measured. On PRs, that is the merge commit GitHub checks out (`refs/pull/<number>/merge`),
 * not the PR's head commit. Only `required` results fail the run when the upload fails, i.e. on develop where they are
 * the baseline for PRs.
 */
async function uploadResults(results, { required }) {
  try {
    await fs.writeFile(RESULTS_FILE_PATH, JSON.stringify({ sha: context.sha, results }), 'utf8');
    await artifactClient.uploadArtifact(ARTIFACT_NAME, [RESULTS_FILE_PATH], ACTION_DIRECTORY);
  } catch (error) {
    if (required) {
      throw error;
    }
    core.warning(`Unable to upload size-limit results: ${error.message}`);
  }
}

/**
 * On PRs, GitHub checks out a merge of the PR into its base branch (`refs/pull/<number>/merge`). Its first parent is the
 * base branch commit this PR is compared against.
 */
async function getMergedBaseSha(octokit) {
  try {
    const { data } = await octokit.rest.repos.getCommit({ ...context.repo, ref: context.sha });
    return data.parents[0].sha;
  } catch (error) {
    core.warning(`Unable to resolve the base commit of the PR test merge: ${error.message}`);
    return undefined;
  }
}

/**
 * Find the open PR this PR is stacked on, if any. With GitHub stacks, a PR is tested on top of its base PR's test merge,
 * whose second parent is the base PR's head. With a plain base branch, the merge base is the base PR's head itself.
 */
async function findBasePr(octokit, mergedBaseSha) {
  try {
    const { data } = await octokit.rest.repos.getCommit({ ...context.repo, ref: mergedBaseSha });
    const candidates = [mergedBaseSha, ...data.parents.slice(1).map(({ sha }) => sha)];

    for (const sha of candidates) {
      const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        ...context.repo,
        commit_sha: sha,
      });
      const basePr = prs.find(
        pr =>
          pr.state === 'open' &&
          pr.head.sha === sha &&
          pr.head.repo?.full_name === `${context.repo.owner}/${context.repo.repo}`,
      );
      if (basePr) {
        return basePr;
      }
    }
  } catch (error) {
    core.warning(`Unable to check whether this PR is stacked: ${error.message}`);
  }

  return undefined;
}

/**
 * A stacked PR compares only against its base PR's results, because the comparison branch would also count the base
 * PR's changes. The base PR's Size Check usually runs at the same time as ours, so we wait for it.
 */
async function downloadBaseline(octokit, githubToken, { comparisonBranch, basePr }) {
  try {
    let found;
    if (basePr) {
      core.info(`Waiting for the results of base PR #${basePr.number}`);
      const sha = basePr.head.sha;
      await waitForSizeCheck(octokit, { workflow: WORKFLOW_FILE, sha, timeoutMs: BASE_PR_WAIT_MS });
      found = await getArtifactForCommit(octokit, { workflow: WORKFLOW_FILE, sha, artifactName: ARTIFACT_NAME });
    } else {
      found = await getArtifactForBranch(octokit, {
        workflow: WORKFLOW_FILE,
        branch: comparisonBranch,
        artifactName: ARTIFACT_NAME,
      });
    }

    if (!found) {
      throw new Error('No artifacts found');
    }

    await artifactClient.downloadArtifact(found.artifact.id, {
      path: ACTION_DIRECTORY,
      findBy: {
        token: githubToken,
        workflowRunId: found.workflowRun.id,
        repositoryOwner: context.repo.owner,
        repositoryName: context.repo.repo,
      },
    });

    const data = JSON.parse(await fs.readFile(RESULTS_FILE_PATH, 'utf8'));
    // Older artifacts store only the results, measured on the run's head commit
    return {
      results: data.results ?? data,
      sha: data.sha ?? found.workflowRun.head_sha,
      workflowRun: found.workflowRun,
    };
  } catch (error) {
    core.warning(`Unable to find base results: ${error.message}`);
    return undefined;
  }
}

/**
 * Report which commits were compared, and whether the baseline contains exactly what this PR was tested against.
 */
async function describeBaseline(octokit, { baseline, mergedBaseSha, comparisonBranch, basePr }) {
  const unverified = '⚠️ Unable to verify whether the baseline matches the PR build.';
  if (!mergedBaseSha) {
    return [unverified];
  }

  const { sha, workflowRun } = baseline;
  const parts = [
    `Compared: ${commitLink(context.sha)} (PR test merge using ${comparisonBranch} at ${commitLink(mergedBaseSha)})`,
    `Against: ${commitLink(sha)} (${basePr ? `base PR #${basePr.number}` : comparisonBranch}) · [base run #${workflowRun.run_number}](${workflowRun.html_url})`,
  ];

  try {
    if (sha === mergedBaseSha || (await haveSameTree(octokit, sha, mergedBaseSha))) {
      parts.push("✅ Baseline matches: this diff contains only this PR's changes.");
      return parts;
    }

    const { data: comparison } = await octokit.rest.repos.compareCommitsWithBasehead({
      ...context.repo,
      basehead: `${sha}...${mergedBaseSha}`,
    });
    const differences = [];
    if (comparison.ahead_by > 0) {
      differences.push(`${comparison.ahead_by} commit(s) in the PR build are missing from the baseline`);
    }
    if (comparison.behind_by > 0) {
      differences.push(`${comparison.behind_by} commit(s) in the baseline are missing from the PR build`);
    }
    const guidance =
      comparison.behind_by > 0
        ? `Rebase your PR onto the latest ${comparisonBranch} to compare against an up-to-date baseline.`
        : `Re-run once the baseline build for ${commitLink(mergedBaseSha)} finishes.`;
    parts.push(
      `⚠️ Baseline mismatch: ${differences.join('; ')}. Their size changes also affect this comparison. ` +
        `[Compare commits](${comparison.html_url}). ${guidance}`,
    );
  } catch (error) {
    core.warning(`Unable to check baseline alignment: ${error.message}`);
    parts.push(unverified);
  }

  return parts;
}

/**
 * A base PR is measured on its own test merge commit. With a plain base branch, that commit differs from the one this
 * PR was tested against, but has the same tree when the base branch is up to date with develop.
 */
async function haveSameTree(octokit, shaA, shaB) {
  const [{ data: a }, { data: b }] = await Promise.all([
    octokit.rest.repos.getCommit({ ...context.repo, ref: shaA }),
    octokit.rest.repos.getCommit({ ...context.repo, ref: shaB }),
  ]);
  return a.commit.tree.sha === b.commit.tree.sha;
}

async function hasLabel(octokit, pr, label) {
  const { data } = await octokit.rest.pulls.get({ ...context.repo, pull_number: pr.number });
  return data.labels.some(({ name }) => name === label);
}

/**
 * Keep one size report comment up to date. A size increase also gets its own comment, which notifies the author.
 */
async function updatePrComments(octokit, pr, { body, failure }) {
  try {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      ...context.repo,
      issue_number: pr.number,
      per_page: 100,
    });

    const report = comments.find(comment => comment.body.startsWith(SIZE_LIMIT_HEADING));
    if (report) {
      await octokit.rest.issues.updateComment({ ...context.repo, comment_id: report.id, body });
    } else {
      await octokit.rest.issues.createComment({ ...context.repo, issue_number: pr.number, body });
    }

    if (failure === INCREASE_FAILURE && !comments.some(comment => comment.body === failure)) {
      await octokit.rest.issues.createComment({ ...context.repo, issue_number: pr.number, body: failure });
    }
  } catch {
    core.warning('Unable to update PR comments. The size report is available in the job summary.');
  }
}

function commitLink(sha) {
  return `[${sha.slice(0, 7)}](${REPO_URL}/commit/${sha})`;
}

await run().catch(error => {
  core.error(error);
  core.setFailed(error.message);
});
