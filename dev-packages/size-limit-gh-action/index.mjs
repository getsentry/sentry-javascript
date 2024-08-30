/* eslint-disable max-lines */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as artifact from '@actions/artifact';
import * as core from '@actions/core';
import { exec } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import * as glob from '@actions/glob';
import * as io from '@actions/io';
import bytes from 'bytes';
import { markdownTable } from 'markdown-table';

const SIZE_LIMIT_HEADING = '## size-limit report 📦 ';
const ARTIFACT_NAME = 'size-limit-action';
const RESULTS_FILE = 'size-limit-results.json';

async function fetchPreviousComment(octokit, repo, pr) {
  const { data: commentList } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number: pr.number,
  });

  const sizeLimitComment = commentList.find(comment => comment.body.startsWith(SIZE_LIMIT_HEADING));
  return !sizeLimitComment ? null : sizeLimitComment;
}

class SizeLimit {
  formatBytes(size) {
    return bytes.format(size, { unitSeparator: ' ' });
  }

  formatSizeLimitResult(size, sizeLimit, passed) {
    if (passed) {
      return this.formatBytes(size);
    }

    return `⛔️ ${this.formatBytes(size)} (max: ${this.formatBytes(sizeLimit)})`;
  }

  formatPercentageChange(base = 0, current = 0) {
    if (base === 0) {
      return 'added';
    }

    if (current === 0) {
      return 'removed';
    }

    const value = ((current - base) / base) * 100;
    const formatted = (Math.sign(value) * Math.ceil(Math.abs(value) * 100)) / 100;

    if (value > 0) {
      return `+${formatted}%`;
    }

    if (value === 0) {
      return '-';
    }

    return `${formatted}%`;
  }

  formatChange(base = 0, current = 0) {
    if (base === 0) {
      return 'added';
    }

    if (current === 0) {
      return 'removed';
    }

    const value = current - base;
    const formatted = this.formatBytes(value);

    if (value > 0) {
      return `+${formatted} 🔺`;
    }

    if (value === 0) {
      return '-';
    }

    return `${formatted} 🔽`;
  }

  formatLine(value, change) {
    return `${value} (${change})`;
  }

  formatSizeResult(name, base, current) {
    return [
      name,
      this.formatSizeLimitResult(current.size, current.sizeLimit, current.passed),
      this.formatPercentageChange(base.size, current.size),
      this.formatChange(base.size, current.size),
    ];
  }

  parseResults(output) {
    const results = JSON.parse(output);

    return results.reduce((current, result) => {
      return {
        // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
        ...current,
        [result.name]: {
          name: result.name,
          size: +result.size,
          sizeLimit: +result.sizeLimit,
          passed: result.passed || false,
        },
      };
    }, {});
  }

  hasSizeChanges(base, current, threshold = 0) {
    const names = [...new Set([...(base ? Object.keys(base) : []), ...Object.keys(current)])];

    return !!names.find(name => {
      const baseResult = base?.[name] || EmptyResult;
      const currentResult = current[name] || EmptyResult;

      if (baseResult.size === 0 && currentResult.size === 0) {
        return true;
      }

      return Math.abs((currentResult.size - baseResult.size) / baseResult.size) * 100 > threshold;
    });
  }

  formatResults(base, current) {
    const names = [...new Set([...(base ? Object.keys(base) : []), ...Object.keys(current)])];
    const header = SIZE_RESULTS_HEADER;
    const fields = names.map(name => {
      const baseResult = base?.[name] || EmptyResult;
      const currentResult = current[name] || EmptyResult;

      return this.formatSizeResult(name, baseResult, currentResult);
    });

    return [header, ...fields];
  }
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

  return { status, output };
}

const SIZE_RESULTS_HEADER = ['Path', 'Size', '% Change', 'Change'];

const EmptyResult = {
  name: '-',
  size: 0,
};

async function run() {
  const { getInput, setFailed } = core;

  try {
    const { payload, repo } = context;
    const pr = payload.pull_request;

    const comparisonBranch = getInput('comparison_branch');
    const githubToken = getInput('github_token');
    const threshold = getInput('threshold');

    if (comparisonBranch && !pr) {
      throw new Error('No PR found. Only pull_request workflows are supported.');
    }

    const octokit = getOctokit(githubToken);
    const limit = new SizeLimit();
    const artifactClient = artifact.create();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const resultsFilePath = path.resolve(__dirname, RESULTS_FILE);

    // If we have no comparison branch, we just run size limit & store the result as artifact
    if (!comparisonBranch) {
      let base;
      const { output: baseOutput } = await execSizeLimit();

      try {
        base = limit.parseResults(baseOutput);
      } catch (error) {
        core.error('Error parsing size-limit output. The output should be a json.');
        throw error;
      }

      try {
        await fs.writeFile(resultsFilePath, JSON.stringify(base), 'utf8');
      } catch (err) {
        core.error(err);
      }
      const globber = await glob.create(resultsFilePath, {
        followSymbolicLinks: false,
      });
      const files = await globber.glob();

      await artifactClient.uploadArtifact(ARTIFACT_NAME, files, __dirname);

      return;
    }

    // Else, we run size limit for the current branch, AND fetch it for the comparison branch
    let base;
    let current;
    let baseIsNotLatest = false;
    let baseWorkflowRun;

    try {
      const artifacts = await getArtifactsForBranchAndWorkflow(octokit, {
        ...repo,
        artifactName: ARTIFACT_NAME,
        branch: comparisonBranch,
        workflowName: `${process.env.GITHUB_WORKFLOW || ''}`,
      });

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

    const { status, output } = await execSizeLimit();
    try {
      current = limit.parseResults(output);
    } catch (error) {
      core.error('Error parsing size-limit output. The output should be a json.');
      throw error;
    }

    const thresholdNumber = Number(threshold);

    // @ts-ignore
    const sizeLimitComment = await fetchPreviousComment(octokit, repo, pr);

    const shouldComment =
      isNaN(thresholdNumber) || limit.hasSizeChanges(base, current, thresholdNumber) || sizeLimitComment;

    if (shouldComment) {
      const bodyParts = [SIZE_LIMIT_HEADING];

      if (baseIsNotLatest) {
        bodyParts.push(
          '⚠️ **Warning:** Base artifact is not the latest one, because the latest workflow run is not done yet. This may lead to incorrect results. Try to re-run all tests to get up to date results.',
        );
      }
      try {
        bodyParts.push(markdownTable(limit.formatResults(base, current)));
      } catch (error) {
        core.error('Error generating markdown table');
        core.error(error);
      }

      if (baseWorkflowRun) {
        bodyParts.push('');
        bodyParts.push(`[View base workflow run](${baseWorkflowRun.html_url})`);
      }

      const body = bodyParts.join('\r\n');

      try {
        if (!sizeLimitComment) {
          await octokit.rest.issues.createComment({
            ...repo,
            issue_number: pr.number,
            body,
          });
        } else {
          await octokit.rest.issues.updateComment({
            ...repo,
            comment_id: sizeLimitComment.id,
            body,
          });
        }
      } catch (error) {
        core.error(
          "Error updating comment. This can happen for PR's originating from a fork without write permissions.",
        );
      }
    }

    if (status > 0) {
      setFailed('Size limit has been exceeded.');
    }
  } catch (error) {
    core.error(error);
    setFailed(error.message);
  }
}

// max pages of workflows to pagination through
const DEFAULT_MAX_PAGES = 50;
// max results per page
const DEFAULT_PAGE_LIMIT = 10;

/**
 * Fetch artifacts from a workflow run from a branch
 *
 * This is a bit hacky since GitHub Actions currently does not directly
 * support downloading artifacts from other workflows
 */
/**
 * Fetch artifacts from a workflow run from a branch
 *
 * This is a bit hacky since GitHub Actions currently does not directly
 * support downloading artifacts from other workflows
 */
async function getArtifactsForBranchAndWorkflow(octokit, { owner, repo, workflowName, branch, artifactName }) {
  core.startGroup(`getArtifactsForBranchAndWorkflow - workflow:"${workflowName}",  branch:"${branch}"`);

  let repositoryWorkflow = null;

  // For debugging
  const allWorkflows = [];

  //
  // Find workflow id from `workflowName`
  //
  for await (const response of octokit.paginate.iterator(octokit.rest.actions.listRepoWorkflows, {
    owner,
    repo,
  })) {
    const targetWorkflow = response.data.find(({ name }) => name === workflowName);

    allWorkflows.push(...response.data.map(({ name }) => name));

    // If not found in responses, continue to search on next page
    if (!targetWorkflow) {
      continue;
    }

    repositoryWorkflow = targetWorkflow;
    break;
  }

  if (!repositoryWorkflow) {
    core.info(
      `Unable to find workflow with name "${workflowName}" in the repository. Found workflows: ${allWorkflows.join(
        ', ',
      )}`,
    );
    core.endGroup();
    return null;
  }

  const workflow_id = repositoryWorkflow.id;

  let currentPage = 0;
  let latestWorkflowRun = null;

  for await (const response of octokit.paginate.iterator(octokit.rest.actions.listWorkflowRuns, {
    owner,
    repo,
    workflow_id,
    branch,
    per_page: DEFAULT_PAGE_LIMIT,
    event: 'push',
  })) {
    if (!response.data.length) {
      core.warning(`Workflow ${workflow_id} not found in branch ${branch}`);
      core.endGroup();
      return null;
    }

    // Do not allow downloading artifacts from a fork.
    const filtered = response.data.filter(workflowRun => workflowRun.head_repository.full_name === `${owner}/${repo}`);

    // Sort to ensure the latest workflow run is the first
    filtered.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Store the first workflow run, to determine if this is the latest one...
    if (!latestWorkflowRun) {
      latestWorkflowRun = filtered[0];
    }

    // Search through workflow artifacts until we find a workflow run w/ artifact name that we are looking for
    for (const workflowRun of filtered) {
      core.info(`Checking artifacts for workflow run: ${workflowRun.html_url}`);

      const {
        data: { artifacts },
      } = await octokit.rest.actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: workflowRun.id,
      });

      if (!artifacts) {
        core.warning(
          `Unable to fetch artifacts for branch: ${branch}, workflow: ${workflow_id}, workflowRunId: ${workflowRun.id}`,
        );
      } else {
        const foundArtifact = artifacts.find(({ name }) => name === artifactName);
        if (foundArtifact) {
          core.info(`Found suitable artifact: ${foundArtifact.url}`);
          return {
            artifact: foundArtifact,
            workflowRun,
            isLatest: latestWorkflowRun.id === workflowRun.id,
          };
        } else {
          core.info(`No artifact found for ${artifactName}, trying next workflow run...`);
        }
      }
    }

    if (currentPage > DEFAULT_MAX_PAGES) {
      core.warning(`Workflow ${workflow_id} not found in branch: ${branch}`);
      core.endGroup();
      return null;
    }

    currentPage++;
  }

  core.warning(`Artifact not found: ${artifactName}`);
  core.endGroup();
  return null;
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
