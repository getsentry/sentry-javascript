import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';

async function run() {
  const { getInput } = core;

  const { repo, owner } = context.repo;

  const githubToken = getInput('github_token');
  const clearDevelop = inputToBoolean(getInput('clear_develop', { type: 'boolean' }));
  const clearBranches = inputToBoolean(getInput('clear_branches', { type: 'boolean', default: true }));
  const clearPending = inputToBoolean(getInput('clear_pending_prs', { type: 'boolean' }));
  const workflowName = getInput('workflow_name');

  const octokit = getOctokit(githubToken);

  await clearGithubCaches(octokit, {
    repo,
    owner,
    clearDevelop,
    clearPending,
    clearBranches,
    workflowName,
  });
}

/**
 * Clear caches.
 *
 * @param {ReturnType<import("@actions/github").getOctokit> } octokit
 * @param {{repo: string, owner: string, clearDevelop: boolean, clearPending: boolean, clearBranches: boolean, workflowName: string}} options
 */
async function clearGithubCaches(octokit, { repo, owner, clearDevelop, clearPending, clearBranches, workflowName }) {
  let deletedCaches = 0;
  let remainingCaches = 0;

  let deletedSize = 0;
  let remainingSize = 0;

  /** @type {Map<number, ReturnType<typeof octokit.rest.pulls.get>>} */
  const cachedPrs = new Map();
  /** @type {Map<string, ReturnType<typeof octokit.rest.actions.listWorkflowRunsForRepo>>} */
  const cachedWorkflows = new Map();

  /**
   * Clear caches.
   *
   * @param {{ref: string}} options
   */
  const shouldClearCache = async ({ ref }) => {
    // Do not clear develop caches if clearDevelop is false.
    if (!clearDevelop && ref === 'refs/heads/develop') {
      core.info('> Keeping cache because it is on develop.');
      return false;
    }

    // There are two fundamental paths here:
    // If the cache belongs to a PR, we need to check if the PR has any pending workflows.
    // Else, we assume the cache belongs to a branch, where we do not check for pending workflows
    const pullNumber = /^refs\/pull\/(\d+)\/merge$/.exec(ref)?.[1];
    const isPr = !!pullNumber;

    // Case 1: This is a PR, and we do not want to clear pending PRs
    // In this case, we need to fetch all PRs and workflow runs to check them
    if (isPr && !clearPending) {
      const pr =
        cachedPrs.get(pullNumber) ||
        (await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        }));
      cachedPrs.set(pullNumber, pr);

      const prBranch = pr.data.head.ref;

      // Check if PR has any pending workflows
      const workflowRuns =
        cachedWorkflows.get(prBranch) ||
        (await octokit.rest.actions.listWorkflowRunsForRepo({
          repo,
          owner,
          branch: prBranch,
        }));
      cachedWorkflows.set(prBranch, workflowRuns);

      // We only care about the relevant workflow
      const relevantWorkflowRuns = workflowRuns.data.workflow_runs.filter(workflow => workflow.name === workflowName);

      const latestWorkflowRun = relevantWorkflowRuns[0];

      core.info(`> Latest relevant workflow run: ${latestWorkflowRun.html_url}`);

      // No relevant workflow? Clear caches!
      if (!latestWorkflowRun) {
        core.info('> Clearing cache because no relevant workflow was found.');
        return true;
      }

      // If the latest run was not successful, keep caches
      // as either the run may be in progress,
      // or failed - in which case we may want to re-run the workflow
      if (latestWorkflowRun.conclusion !== 'success') {
        core.info(`> Keeping cache because latest workflow is ${latestWorkflowRun.conclusion}.`);
        return false;
      }

      core.info(`> Clearing cache because latest workflow run is ${latestWorkflowRun.conclusion}.`);
      return true;
    }

    // Case 2: This is a PR, but we do want to clear pending PRs
    // In this case, this cache should always be cleared
    if (isPr) {
      core.info('> Clearing cache of every PR workflow run.');
      return true;
    }

    // Case 3: This is not a PR, and we want to clean branches
    if (clearBranches) {
      core.info('> Clearing cache because it is not a PR.');
      return true;
    }

    // Case 4: This is not a PR, and we do not want to clean branches
    core.info('> Keeping cache for non-PR workflow run.');
    return false;
  };

  for await (const response of octokit.paginate.iterator(octokit.rest.actions.getActionsCacheList, {
    owner,
    repo,
  })) {
    if (!response.data.length) {
      break;
    }

    for (const { id, ref, size_in_bytes } of response.data) {
      core.info(`Checking cache ${id} for ${ref}...`);

      const shouldDelete = await shouldClearCache({ ref });

      if (shouldDelete) {
        core.info(`> Clearing cache ${id}...`);

        deletedCaches++;
        deletedSize += size_in_bytes;

        await octokit.rest.actions.deleteActionsCacheById({
          owner,
          repo,
          cache_id: id,
        });
      } else {
        remainingCaches++;
        remainingSize += size_in_bytes;
      }
    }
  }

  const format = new Intl.NumberFormat('en-US', {
    style: 'decimal',
  });

  core.info('Summary:');
  core.info(`Deleted ${deletedCaches} caches, freeing up ~${format.format(deletedSize / 1000 / 1000)} mb.`);
  core.info(`Remaining ${remainingCaches} caches, using ~${format.format(remainingSize / 1000 / 1000)} mb.`);
}

run();

function inputToBoolean(input) {
  if (typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'string') {
    return input === 'true';
  }

  return false;
}
