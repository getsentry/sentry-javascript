import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import { markdownTable } from 'markdown-table';
import sizeConfig from '../../.size-limit.js';
import { getArtifactsForBranchAndWorkflow } from './utils/getArtifactsForBranchAndWorkflow.mjs';
import { MAX_INCREASE_BYTES, SizeLimitFormatter } from './utils/SizeLimitFormatter.mjs';

const OVERRIDE_LABEL = 'Accept Bundlesize Increase';
const SIZE_LIMIT_HEADING = '## size-limit report 📦 ';
const ARTIFACT_NAME = 'size-limit-action';
const ACTION_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE_PATH = path.join(ACTION_DIRECTORY, 'size-limit-results.json');

const { getInput, setFailed } = core;

async function fetchPreviousComment(octokit, repo, pr) {
  const { data: commentList } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number: pr.number,
  });

  const sizeLimitComment = commentList.find(comment => comment.body.startsWith(SIZE_LIMIT_HEADING));
  return !sizeLimitComment ? null : sizeLimitComment;
}

async function run() {
  try {
    const { payload, repo } = context;
    const pr = payload.pull_request;

    // The comparison branch is the base branch we are comparing against (in our case usually develop)
    const comparisonBranch = getInput('comparison_branch');
    const githubToken = getInput('github_token');

    if (comparisonBranch && !pr) {
      throw new Error('No PR found. Only pull_request workflows are supported.');
    }

    const octokit = getOctokit(githubToken);
    const limit = new SizeLimitFormatter();
    const artifactClient = new DefaultArtifactClient();

    // Build and measure each bundle defined in .size-limit.js for the current branch
    const { stdout } = await getExecOutput('yarn', ['run', '--silent', 'size-limit', '--json']);
    const current = limit.parseResults(stdout);

    // If we have no comparison branch, we only store the results as artifacts (likely running on develop)
    if (!comparisonBranch) {
      await fs.writeFile(RESULTS_FILE_PATH, JSON.stringify(current), 'utf8');
      await artifactClient.uploadArtifact(ARTIFACT_NAME, [RESULTS_FILE_PATH], ACTION_DIRECTORY);
      return;
    }

    // Else, we fetch the results for the comparison branch and compare them with the current branch (likely running on a PR)
    let base;
    let baseIsNotLatest = false;
    let baseWorkflowRun;

    try {
      const workflowName = process.env.GITHUB_WORKFLOW;
      core.startGroup(`getArtifactsForBranchAndWorkflow - workflow:"${workflowName}",  branch:"${comparisonBranch}"`);
      const artifacts = await getArtifactsForBranchAndWorkflow(octokit, {
        ...repo,
        artifactName: ARTIFACT_NAME,
        branch: comparisonBranch,
        workflowName,
      });
      core.endGroup();

      if (!artifacts) {
        throw new Error('No artifacts found');
      }

      baseWorkflowRun = artifacts.workflowRun;

      await artifactClient.downloadArtifact(artifacts.artifact.id, {
        path: ACTION_DIRECTORY,
        findBy: {
          token: githubToken,
          workflowRunId: artifacts.workflowRun.id,
          repositoryOwner: repo.owner,
          repositoryName: repo.repo,
        },
      });

      base = JSON.parse(await fs.readFile(RESULTS_FILE_PATH, { encoding: 'utf8' }));

      if (!artifacts.isLatest) {
        baseIsNotLatest = true;
        core.info('Base artifact is not the latest one. This may lead to incorrect results.');
      }
    } catch (error) {
      core.startGroup('Warning, unable to find base results');
      core.error(error);
      core.endGroup();
    }

    const { data: currentPr } = await octokit.rest.pulls.get({
      ...repo,
      pull_number: pr.number,
    });
    const approved = currentPr.labels.some(label => label.name === OVERRIDE_LABEL);
    const increases = base ? limit.getSizeIncreases(base, current, sizeConfig) : [];
    const bodyParts = [SIZE_LIMIT_HEADING];

    if (baseIsNotLatest) {
      bodyParts.push(
        '⚠️ **Warning:** The baseline is behind the target branch. Re-run after the latest base build completes for up-to-date results.',
      );
    }

    let failure;
    if (!base) {
      failure = 'No baseline size measurements found. Re-run after the base build completes.';
      bodyParts.push(failure);
    } else if (increases.length > 0) {
      const details = increases.map(({ name, increase }) => `${name}: +${increase} bytes`).join('\n');
      if (approved) {
        bodyParts.push(`Bundle size increase acknowledged by "${OVERRIDE_LABEL}".\n\n${details}`);
      } else {
        failure =
          `Gzipped bundles increased by more than ${MAX_INCREASE_BYTES} bytes:\n${details}\n` +
          `Apply "${OVERRIDE_LABEL}" to acknowledge the increase.`;
        bodyParts.push(failure);
      }
    }

    bodyParts.push(markdownTable(limit.formatResults(base, current)));
    if (baseWorkflowRun) {
      bodyParts.push(`[View base workflow run](${baseWorkflowRun.html_url})`);
    }

    const body = bodyParts.join('\n\n');
    await core.summary.addRaw(body).write();

    try {
      const sizeLimitComment = await fetchPreviousComment(octokit, repo, pr);
      if (sizeLimitComment) {
        await octokit.rest.issues.updateComment({
          ...repo,
          comment_id: sizeLimitComment.id,
          body,
        });
      } else {
        await octokit.rest.issues.createComment({
          ...repo,
          issue_number: pr.number,
          body,
        });
      }
    } catch {
      core.warning('Unable to update the PR comment. The size report is available in the job summary.');
    }

    if (failure) {
      setFailed(failure);
    }
  } catch (error) {
    core.error(error);
    setFailed(error.message);
  }
}

await run();
