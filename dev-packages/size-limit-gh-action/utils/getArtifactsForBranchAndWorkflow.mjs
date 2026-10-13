import * as core from '@actions/core';

// How many commits to walk back on the branch before giving up on finding a build with a size-limit artifact.
const DEFAULT_MAX_COMMITS = 50;
const COMMITS_PER_PAGE = 100;
const RUNS_PER_PAGE = 100;

/**
 * Find the most recent build artifact for a branch by walking its git history.
 *
 * We deliberately drive this from `repos.listCommits` (authoritative, strictly ordered git history) rather than from
 * `listWorkflowRuns` filtered by branch + event. That listing is backed by an eventually-consistent index that can omit
 * or reorder very recent runs, which previously made us silently compare against a days-old baseline while still
 * reporting it as the latest one. Walking commits newest-first and pinning each run by `head_sha` sidesteps that: the
 * order is exact, and if the tip commit has no artifact yet we fall back to its parent and correctly report the baseline
 * as not-latest.
 */
export async function getArtifactsForBranchAndWorkflow(octokit, { owner, repo, workflowName, branch, artifactName }) {
  const workflowId = await findWorkflowId(octokit, { owner, repo, workflowName });

  if (!workflowId) {
    return null;
  }

  let commitsChecked = 0;

  for await (const response of octokit.paginate.iterator(octokit.rest.repos.listCommits, {
    owner,
    repo,
    sha: branch,
    per_page: COMMITS_PER_PAGE,
  })) {
    for (const { sha } of response.data) {
      const isLatest = commitsChecked === 0;
      commitsChecked++;

      const found = await findArtifactForCommit(octokit, { owner, repo, workflowId, sha, artifactName });

      if (found) {
        if (!isLatest) {
          core.info(
            `Base artifact comes from commit ${sha}, which is ${commitsChecked - 1} commit(s) behind the tip of "${branch}".`,
          );
        }
        return { ...found, isLatest };
      }

      if (commitsChecked >= DEFAULT_MAX_COMMITS) {
        core.warning(
          `No "${artifactName}" artifact found within the last ${DEFAULT_MAX_COMMITS} commits of "${branch}".`,
        );
        return null;
      }
    }
  }

  core.warning(`No "${artifactName}" artifact found on branch "${branch}".`);
  return null;
}

/**
 * Resolve a workflow's numeric id from its display name.
 */
async function findWorkflowId(octokit, { owner, repo, workflowName }) {
  const allWorkflows = [];

  for await (const response of octokit.paginate.iterator(octokit.rest.actions.listRepoWorkflows, { owner, repo })) {
    const targetWorkflow = response.data.find(({ name }) => name === workflowName);
    allWorkflows.push(...response.data.map(({ name }) => name));

    if (targetWorkflow) {
      return targetWorkflow.id;
    }
  }

  core.info(
    `Unable to find workflow with name "${workflowName}" in the repository. Found workflows: ${allWorkflows.join(', ')}`,
  );
  return null;
}

/**
 * Return the first `artifactName` artifact produced by any run of `workflowId` for the exact `sha`, preferring the most
 * recent run (in case of re-runs). Runs originating from a fork are never trusted.
 */
async function findArtifactForCommit(octokit, { owner, repo, workflowId, sha, artifactName }) {
  const {
    data: { workflow_runs: workflowRuns },
  } = await octokit.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: workflowId,
    head_sha: sha,
    per_page: RUNS_PER_PAGE,
  });

  const runs = workflowRuns
    .filter(workflowRun => workflowRun.head_repository?.full_name === `${owner}/${repo}`)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const workflowRun of runs) {
    const {
      data: { artifacts },
    } = await octokit.rest.actions.listWorkflowRunArtifacts({
      owner,
      repo,
      run_id: workflowRun.id,
    });

    const artifact = artifacts?.find(({ name }) => name === artifactName);
    if (artifact) {
      core.info(`Found suitable artifact for commit ${sha}: ${artifact.url} (run ${workflowRun.html_url})`);
      return { artifact, workflowRun };
    }
  }

  return null;
}
