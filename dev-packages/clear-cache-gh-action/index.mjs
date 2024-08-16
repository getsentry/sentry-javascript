import * as core from '@actions/core';

import { context, getOctokit } from '@actions/github';

async function run() {
  const { getInput } = core;

  const { repo, owner } = context.repo;

  const githubToken = getInput('github_token');
  const clearDevelop = getInput('clear_develop', { type: 'boolean' });
  const clearPending = getInput('clear_pending', { type: 'boolean' });
  const workflowName = getInput('workflow_name');

  const octokit = getOctokit(githubToken);

  await clearGithubCaches(octokit, {
    repo,
    owner,
    clearDevelop,
    clearPending,
    workflowName,
  });
}

/**
 * Clear caches.
 *
 * @param {ReturnType<import("@actions/github").getOctokit> } octokit
 * @param {{repo: string, owner: string, clearDevelop: boolean, clearPending: boolean, workflowName: string}} options
 */
async function clearGithubCaches(octokit, { repo, owner, clearDevelop, clearPending, workflowName }) {
  for await (const response of octokit.paginate.iterator(octokit.rest.actions.getActionsCacheList, {
    owner,
    repo,
  })) {
    if (!response.data.length) {
      break;
    }

    for (const { id, ref } of response.data) {
      core.info(`Checking cache ${id} for ${ref}...`);
      // Do not clear develop caches if clearDevelop is false.
      if (!clearDevelop && ref === 'refs/head/develop') {
        core.info('> Keeping cache because it is on develop.');
        continue;
      }

      // If clearPending is false, do not clear caches for pull requests that have pending checks.
      const pull_number = /^refs\/pull\/(\d+)\/merge$/.exec(ref)?.[1];
      if (!clearPending && pull_number) {
        const pr = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number,
        });

        const prBranch = pr.data.head.ref;

        // Check if PR has any pending workflows
        const workflowRuns = await octokit.rest.actions.listWorkflowRunsForRepo({
          repo,
          owner,
          branch: prBranch,
        });

        // We only care about the relevant workflow
        const relevantWorkflowRuns = workflowRuns.data.workflow_runs.filter(workflow => workflow.name === workflowName);

        const latestWorkflowRun = relevantWorkflowRuns[0];

        core.info(`> Latest relevant workflow run: ${latestWorkflowRun.html_url}`);

        // No relevant workflow? Clear caches!
        if (!latestWorkflowRun) {
          core.info('> Clearing cache because no relevant workflow was found.');
          continue;
        }

        // If the latest run was not successful, keep caches
        // as either the run may be in progress,
        // or failed - in which case we may want to re-run the workflow
        if (latestWorkflowRun.conclusion !== 'success') {
          core.info(`> Keeping cache because latest workflow is ${latestWorkflowRun.status}.`);
          continue;
        }

        core.info(`> Clearing cache because latest workflow run is ${latestWorkflowRun.status}.`);
      } else {
        core.info('Clearing cache because it is not a PR');
      }

      // DRY RUN FOR NOW!
      core.info(`Would delete cache ${id} for ${ref}...`);

      /*   await octokit.rest.actions.deleteActionsCacheById({
        owner,
        repo,
        cache_id: id,
      }); */
    }
  }
}

run();
