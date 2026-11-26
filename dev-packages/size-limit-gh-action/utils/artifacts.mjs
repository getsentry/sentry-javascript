import * as core from '@actions/core';
import { context } from '@actions/github';

const MAX_COMMITS = 50;
const SIZE_CHECK_JOB_NAME = 'Size Check';
const POLL_INTERVAL_MS = 30_000;

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

export async function getArtifactForCommit(octokit, { workflow, sha, artifactName }) {
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

export async function waitForSizeCheck(octokit, { workflow, sha, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const jobs = [];
    for (const { id } of await listRunsForCommit(octokit, { workflow, sha })) {
      const { data } = await octokit.rest.actions.listJobsForWorkflowRun({
        ...context.repo,
        run_id: id,
        filter: 'latest',
        per_page: 100,
      });
      jobs.push(...data.jobs.filter(({ name }) => name === SIZE_CHECK_JOB_NAME));
    }

    if (jobs.length > 0 && jobs.every(({ status }) => status === 'completed')) {
      return;
    }

    core.info(`Waiting for the ${SIZE_CHECK_JOB_NAME} job of commit ${sha}...`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  core.warning(`Timed out waiting for the ${SIZE_CHECK_JOB_NAME} job of commit ${sha}.`);
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
