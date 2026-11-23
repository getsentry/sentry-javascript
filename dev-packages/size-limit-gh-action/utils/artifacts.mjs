import * as core from '@actions/core';
import { context } from '@actions/github';

const MAX_COMMITS = 50;

/**
 * Find the newest `artifactName` artifact on `branch`. This walks the branch's commits, because listing workflow runs by
 * branch is eventually consistent and can silently skip the most recent runs.
 */
export async function getArtifactForBranch(octokit, { workflow, branch, artifactName }) {
  const { data: commits } = await octokit.rest.repos.listCommits({
    ...context.repo,
    sha: branch,
    per_page: MAX_COMMITS,
  });

  for (const [index, { sha }] of commits.entries()) {
    const found = await getArtifactForCommit(octokit, { workflow, sha, artifactName });
    if (found) {
      if (index > 0) {
        core.info(`Using results from ${sha}, which is ${index} commit(s) behind the tip of "${branch}".`);
      }
      return found;
    }
  }

  core.warning(`No "${artifactName}" artifact found in the last ${commits.length} commits of "${branch}".`);
  return null;
}

async function getArtifactForCommit(octokit, { workflow, sha, artifactName }) {
  for (const workflowRun of await listRunsForCommit(octokit, { workflow, sha })) {
    const { data } = await octokit.rest.actions.listWorkflowRunArtifacts({ ...context.repo, run_id: workflowRun.id });
    const artifact = data.artifacts.find(({ name }) => name === artifactName);
    if (artifact) {
      core.info(`Found "${artifactName}" for commit ${sha} in ${workflowRun.html_url}`);
      return { artifact, workflowRun };
    }
  }

  return null;
}

/**
 * Newest first. Runs from forks are never trusted.
 */
async function listRunsForCommit(octokit, { workflow, sha }) {
  const { data } = await octokit.rest.actions.listWorkflowRuns({
    ...context.repo,
    workflow_id: workflow,
    head_sha: sha,
    per_page: 100,
  });

  return data.workflow_runs
    .filter(run => run.head_repository?.full_name === `${context.repo.owner}/${context.repo.repo}`)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
