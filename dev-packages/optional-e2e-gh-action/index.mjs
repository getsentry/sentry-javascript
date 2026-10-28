import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { markdownTable } from 'markdown-table';

const WORKFLOW_PATH = '.github/workflows/optional-e2e.yml';
const WORKFLOW_NAME = 'CI: Optional E2E Tests';
const COMMENT_MARKER = '<!-- optional-e2e-report -->';
const ICONS = { success: '✅', failure: '❌', cancelled: '⛔', timed_out: '⏱️' };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const octokit = getOctokit(core.getInput('github_token'));
  const { repo } = context;

  if (core.getInput('mode') === 'report') {
    await report(octokit, repo);
    return;
  }

  const pr = context.payload.pull_request;
  const correlationId = `${context.runId}-${process.env.GITHUB_RUN_ATTEMPT}`;

  // A dispatch by file name only works when the file is on the default branch, a dispatch by ID always works.
  const workflows = await octokit.paginate(octokit.rest.actions.listRepoWorkflows, repo);
  const workflow = workflows.find(({ path }) => path === WORKFLOW_PATH);
  if (!workflow) {
    throw new Error(`Workflow ${WORKFLOW_PATH} not found`);
  }

  await octokit.rest.actions.createWorkflowDispatch({
    ...repo,
    workflow_id: workflow.id,
    // A dispatch needs a branch, so it cannot use the PR merge ref. The `commit` input is the merge commit.
    ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
    inputs: {
      commit: core.getInput('commit'),
      build_run_id: String(context.runId),
      matrix: core.getInput('matrix'),
      pr_number: pr ? String(pr.number) : '',
      correlation_id: correlationId,
    },
  });

  const workflowRun = await waitForRun(octokit, repo, workflow.id, correlationId);
  core.info(`Optional E2E tests finished with: ${workflowRun.conclusion}`);
  if (workflowRun.conclusion !== 'success') {
    core.warning(`Optional E2E tests ${workflowRun.conclusion}: ${workflowRun.html_url}`);
  }
}

// Runs as the last job of the optional E2E run itself, so a re-run of that run also updates the comment.
async function report(octokit, repo) {
  const prNumber = Number(core.getInput('pr_number'));
  if (!prNumber) {
    return;
  }

  const { data: workflowRun } = await octokit.rest.actions.getWorkflowRun({ ...repo, run_id: context.runId });
  await reportInComment(octokit, repo, prNumber, workflowRun);
}

async function waitForRun(octokit, repo, workflowId, correlationId) {
  let workflowRun;
  for (let attempt = 0; attempt < 30 && !workflowRun; attempt++) {
    const { data } = await octokit.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: workflowId,
      event: 'workflow_dispatch',
      per_page: 20,
    });
    workflowRun = data.workflow_runs.find(({ display_title }) => display_title.includes(correlationId));
    if (!workflowRun) {
      await sleep(2_000);
    }
  }
  if (!workflowRun) {
    throw new Error('Optional E2E run not found');
  }

  core.info(`Optional E2E run: ${workflowRun.html_url}`);

  while (workflowRun.status !== 'completed') {
    await sleep(30_000);
    ({ data: workflowRun } = await octokit.rest.actions.getWorkflowRun({ ...repo, run_id: workflowRun.id }));
  }

  return workflowRun;
}

// Keeps one comment per PR up to date, so new pushes and re-runs do not add more comments.
async function reportInComment(octokit, repo, prNumber, workflowRun) {
  const jobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
    ...repo,
    run_id: workflowRun.id,
    filter: 'latest',
    per_page: 100,
  });
  // The report job itself is still in progress.
  const ran = jobs.filter(({ status, conclusion }) => status === 'completed' && conclusion !== 'skipped');
  const failing = ran.filter(({ conclusion }) => conclusion !== 'success');
  const successful = ran.filter(({ conclusion }) => conclusion === 'success');
  if (!ran.length) {
    return;
  }

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...repo,
    issue_number: prNumber,
    per_page: 100,
  });
  const previousComment = comments.find(
    ({ user, body }) => user?.login === 'github-actions[bot]' && body?.startsWith(COMMENT_MARKER),
  );

  const counts = [
    failing.length && `${failing.length} not successful`,
    successful.length && `${successful.length} successful`,
  ].filter(Boolean);
  const runLink = `[See the run](${workflowRun.html_url})`;

  const bodyParts = [COMMENT_MARKER, '### Optional E2E tests', ''];
  if (failing.length) {
    bodyParts.push(
      `Some optional checks were not successful. They do not block the merge. ${counts.join(', ')}. ${runLink}.`,
      '',
      formatJobs(failing),
    );
  } else {
    bodyParts.push(`All optional checks were successful. ${counts.join(', ')}. ${runLink}.`);
  }
  if (successful.length) {
    bodyParts.push('', '<details><summary>Successful checks</summary>', '', formatJobs(successful), '', '</details>');
  }
  const body = bodyParts.join('\n');

  if (previousComment) {
    await octokit.rest.issues.updateComment({ ...repo, comment_id: previousComment.id, body });
  } else {
    await octokit.rest.issues.createComment({ ...repo, issue_number: prNumber, body });
  }
}

// Looks like the checks list on the PR page
function formatJobs(jobs) {
  return markdownTable(
    [
      ['', 'Check', 'Status', ''],
      ...jobs.map(job => [
        ICONS[job.conclusion] ?? '❔',
        `${WORKFLOW_NAME} / ${job.name}`,
        formatStatus(job),
        `[Details](${job.html_url})`,
      ]),
    ],
    { alignDelimiters: false },
  );
}

function formatStatus({ conclusion, started_at, completed_at }) {
  const duration = formatDuration(started_at, completed_at);
  const withDuration = (status, preposition) => (duration ? `${status} ${preposition} ${duration}` : status);

  switch (conclusion) {
    case 'success':
      return withDuration('Successful', 'in');
    case 'failure':
      return withDuration('Failing', 'after');
    case 'timed_out':
      return withDuration('Timed out', 'after');
    case 'cancelled':
      return withDuration('Cancelled', 'after');
    default:
      return 'Status unknown';
  }
}

// A job that never started has no `started_at`, and `new Date(null)` is the epoch, which gives a wrong duration.
function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return undefined;
  }
  const seconds = Math.round((new Date(completedAt) - new Date(startedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m` : `${seconds}s`;
}

run().catch(error => core.setFailed(error.message));
