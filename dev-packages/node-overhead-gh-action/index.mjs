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
import { getArtifactsForBranchAndWorkflow } from './lib/getArtifactsForBranchAndWorkflow.mjs';
import { getAveragedOverheadMeasurements } from './lib/getOverheadMeasurements.mjs';
import { formatResults, hasChanges } from './lib/markdown-table-formatter.mjs';

const NODE_OVERHEAD_HEADING = '## node-overhead report 🧳';
const ARTIFACT_NAME = 'node-overhead-action';
const RESULTS_FILE = 'node-overhead-results.json';

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

  return commentList.find(comment => comment.body.startsWith(NODE_OVERHEAD_HEADING));
}

async function run() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  try {
    const { payload, repo } = context;
    const pr = payload.pull_request;

    const comparisonBranch = getInput('comparison_branch');
    const githubToken = getInput('github_token');
    const threshold = getInput('threshold') || 1;

    if (comparisonBranch && !pr) {
      throw new Error('No PR found. Only pull_request workflows are supported.');
    }

    const octokit = getOctokit(githubToken);
    const resultsFilePath = getResultsFilePath();

    // If we have no comparison branch, we just run overhead check & store the result as artifact
    if (!comparisonBranch) {
      return runNodeOverheadOnComparisonBranch();
    }

    // Else, we run overhead check for the current branch, AND fetch it for the comparison branch
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

    core.startGroup('Getting current overhead measurements');
    try {
      current = await getAveragedOverheadMeasurements();
    } catch (error) {
      core.error('Error getting current overhead measurements');
      core.endGroup();
      throw error;
    }
    core.debug(`Current overhead measurements: ${JSON.stringify(current, null, 2)}`);
    core.endGroup();

    const thresholdNumber = Number(threshold);

    const nodeOverheadComment = await fetchPreviousComment(octokit, repo, pr);

    if (nodeOverheadComment) {
      core.debug('Found existing node overhead comment, updating it instead of creating a new one...');
    }

    const shouldComment = isNaN(thresholdNumber) || hasChanges(base, current, thresholdNumber) || nodeOverheadComment;

    if (shouldComment) {
      const bodyParts = [
        NODE_OVERHEAD_HEADING,
        'Note: This is a synthetic benchmark with a minimal express app and does not necessarily reflect the real-world performance impact in an application.',
      ];

      if (baseIsNotLatest) {
        bodyParts.push(
          '⚠️ **Warning:** Base artifact is not the latest one, because the latest workflow run is not done yet. This may lead to incorrect results. Try to re-run all tests to get up to date results.',
        );
      }
      try {
        bodyParts.push(markdownTable(formatResults(base, current)));
      } catch (error) {
        core.error('Error generating markdown table');
        throw error;
      }

      if (baseWorkflowRun) {
        bodyParts.push('');
        bodyParts.push(`[View base workflow run](${baseWorkflowRun.html_url})`);
      }

      const body = bodyParts.join('\r\n');

      try {
        if (!nodeOverheadComment) {
          await octokit.rest.issues.createComment({
            ...repo,
            issue_number: pr.number,
            body,
          });
        } else {
          await octokit.rest.issues.updateComment({
            ...repo,
            comment_id: nodeOverheadComment.id,
            body,
          });
        }
      } catch (error) {
        core.error(
          "Error updating comment. This can happen for PR's originating from a fork without write permissions.",
        );
      }
    } else {
      core.debug('Skipping comment because there are no changes.');
    }
  } catch (error) {
    core.error(error);
    setFailed(error.message);
  }
}

async function runNodeOverheadOnComparisonBranch() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resultsFilePath = getResultsFilePath();

  const artifactClient = new DefaultArtifactClient();

  const result = await getAveragedOverheadMeasurements();

  try {
    await fs.writeFile(resultsFilePath, JSON.stringify(result), 'utf8');
  } catch (error) {
    core.error('Error parsing node overhead output. The output should be a json.');
    throw error;
  }

  const globber = await glob.create(resultsFilePath, {
    followSymbolicLinks: false,
  });
  const files = await globber.glob();

  await artifactClient.uploadArtifact(ARTIFACT_NAME, files, __dirname);
}

run();

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
