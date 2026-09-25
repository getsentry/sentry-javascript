import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import * as glob from '@actions/glob';
import * as io from '@actions/io';
import { markdownTable } from 'markdown-table';
import sizeConfig from '../../.size-limit.js';
import { getArtifactsForBranchAndWorkflow } from './utils/getArtifactsForBranchAndWorkflow.mjs';
import { MAX_INCREASE_BYTES, SizeLimitFormatter } from './utils/SizeLimitFormatter.mjs';

const OVERRIDE_LABEL = 'Accept Bundlesize Increase';
const SIZE_LIMIT_HEADING = '## size-limit report 📦 ';
const ARTIFACT_NAME = 'size-limit-action';
const RESULTS_FILE = 'size-limit-results.json';

function getResultsFilePath() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, RESULTS_FILE);
}

const { getInput, setFailed } = core;

async function fetchPreviousComment(octokit, repo, pr) {
  const { data: commentList } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number: pr.number,
  });

  const sizeLimitComment = commentList.find(comment => comment.body.startsWith(SIZE_LIMIT_HEADING));
  return !sizeLimitComment ? null : sizeLimitComment;
}

async function execSizeLimit() {
  let output = '';

  const status = await exec('yarn run --silent size-limit --json', [], {
    windowsVerbatimArguments: false,
    ignoreReturnCode: true,
    cwd: process.cwd(),
    listeners: {
      stdout: data => {
        output += data.toString();
      },
    },
  });

  if (status !== 0) {
    throw new Error('Bundle size measurement failed.');
  }

  return output;
}

async function run() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  try {
    const { payload, repo } = context;
    const pr = payload.pull_request;

    const comparisonBranch = getInput('comparison_branch');
    const githubToken = getInput('github_token');

    if (comparisonBranch && !pr) {
      throw new Error('No PR found. Only pull_request workflows are supported.');
    }

    const octokit = getOctokit(githubToken);
    const limit = new SizeLimitFormatter();
    const resultsFilePath = getResultsFilePath();

    // If we have no comparison branch, we just run size limit & store the result as artifact
    if (!comparisonBranch) {
      return await runSizeLimitOnComparisonBranch();
    }

    // Else, we run size limit for the current branch, AND fetch it for the comparison branch
    let base;
    let current;
    let baseIsNotLatest = false;
    let baseWorkflowRun;

    try {
      const workflowName = `${process.env.GITHUB_WORKFLOW || ''}`;
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

      await downloadOtherWorkflowArtifact(octokit, {
        ...repo,
        artifactName: ARTIFACT_NAME,
        artifactId: artifacts.artifact.id,
        downloadPath: __dirname,
      });

      base = JSON.parse(await fs.readFile(resultsFilePath, { encoding: 'utf8' }));

      if (!artifacts.isLatest) {
        baseIsNotLatest = true;
        core.info('Base artifact is not the latest one. This may lead to incorrect results.');
      }
    } catch (error) {
      core.startGroup('Warning, unable to find base results');
      core.error(error);
      core.endGroup();
    }

    const output = await execSizeLimit();
    try {
      current = limit.parseResults(output);
    } catch (error) {
      core.error('Error parsing size-limit output. The output should be a json.');
      throw error;
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

async function runSizeLimitOnComparisonBranch() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsFilePath = getResultsFilePath();

  const limit = new SizeLimitFormatter();
  const artifactClient = new DefaultArtifactClient();

  const baseOutput = await execSizeLimit();

  try {
    const base = limit.parseResults(baseOutput);
    await fs.writeFile(resultsFilePath, JSON.stringify(base), 'utf8');
  } catch (error) {
    core.error('Error parsing size-limit output. The output should be a json.');
    throw error;
  }

  const globber = await glob.create(resultsFilePath, {
    followSymbolicLinks: false,
  });
  const files = await globber.glob();

  await artifactClient.uploadArtifact(ARTIFACT_NAME, files, __dirname);
}

await run();

/**
 * Use GitHub API to fetch artifact download url, then
 * download and extract artifact to `downloadPath`
 */
async function downloadOtherWorkflowArtifact(octokit, { owner, repo, artifactId, artifactName, downloadPath }) {
  const artifact = await octokit.rest.actions.downloadArtifact({
    owner,
    repo,
    artifact_id: artifactId,
    archive_format: 'zip',
  });

  // Make sure output path exists
  try {
    await io.mkdirP(downloadPath);
  } catch {
    // ignore errors
  }

  const downloadFile = path.resolve(downloadPath, `${artifactName}.zip`);

  await exec('wget', [
    '-nv',
    '--retry-connrefused',
    '--waitretry=1',
    '--read-timeout=20',
    '--timeout=15',
    '-t',
    '0',
    '-O',
    downloadFile,
    artifact.url,
  ]);

  await exec('unzip', ['-q', '-d', downloadPath, downloadFile], {
    silent: true,
  });
}
