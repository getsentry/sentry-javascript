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
const RELEASE_BRANCH_PREFIX = 'prepare-release/';
const SIZE_LIMIT_HEADING = '## size-limit report 📦 ';
const ARTIFACT_NAME = 'size-limit-action';
const ACTION_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE_PATH = path.join(ACTION_DIRECTORY, 'size-limit-results.json');

const { getInput, setFailed } = core;

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
    let increaseAccepted = false;

    if (comparisonBranch) {
      const { data: currentPr } = await octokit.rest.pulls.get({
        ...repo,
        pull_number: pr.number,
      });
      increaseAccepted = currentPr.labels.some(label => label.name === OVERRIDE_LABEL);
    }

    const limit = new SizeLimitFormatter();
    const artifactClient = new DefaultArtifactClient();

    // Build and measure each bundle defined in .size-limit.js for the current branch
    const { stdout } = await getExecOutput('pnpm', ['exec', 'size-limit', '--json']);
    const current = limit.parseResults(stdout);

    // If we have no comparison branch, we only store the results as artifacts (likely running on develop)
    if (!comparisonBranch) {
      await fs.writeFile(RESULTS_FILE_PATH, JSON.stringify(current), 'utf8');
      await artifactClient.uploadArtifact(ARTIFACT_NAME, [RESULTS_FILE_PATH], ACTION_DIRECTORY);
      return;
    }

    // Else, we fetch the results for the comparison branch and compare them with the current branch (likely running on a PR)
    let base;
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
    } catch (error) {
      core.startGroup('Warning, unable to find base results');
      core.error(error);
      core.endGroup();
    }

    const increases = base ? limit.getSizeIncreases(base, current, sizeConfig) : [];
    const bodyParts = [SIZE_LIMIT_HEADING];

    // Check if our baseline build is up to date with the target branch (likely develop) and report any mismatches
    if (base) {
      const baselineSha = baseWorkflowRun.head_sha; // The commit SHA of the baseline build (where we pull the size-limit results from)
      const repoUrl = `${context.serverUrl}/${repo.owner}/${repo.repo}`;
      const commitLink = sha => `[${sha.slice(0, 7)}](${repoUrl}/commit/${sha})`;

      try {
        const { data: mergeCommit } = await octokit.rest.repos.getCommit({ ...repo, ref: context.sha });
        const mergedBaseSha = mergeCommit.parents[0].sha; // The SHA of the target branch (likely develop) base commit that was used to test this PR

        bodyParts.push(
          `Compared: ${commitLink(context.sha)} (PR test merge using ${comparisonBranch} at ${commitLink(mergedBaseSha)})`,
          `Against: ${commitLink(baselineSha)} (${comparisonBranch}) · [base run #${baseWorkflowRun.run_number}](${baseWorkflowRun.html_url})`,
        );

        if (baselineSha === mergedBaseSha) {
          bodyParts.push("✅ Baseline matches: this diff contains only this PR's changes.");
        } else {
          const { data: comparison } = await octokit.rest.repos.compareCommitsWithBasehead({
            ...repo,
            basehead: `${baselineSha}...${mergedBaseSha}`,
          });
          const differences = [];
          if (comparison.ahead_by > 0) {
            differences.push(
              `${comparison.ahead_by} ${comparisonBranch} commit(s) in the PR build are missing from the baseline`,
            );
          }
          if (comparison.behind_by > 0) {
            differences.push(
              `${comparison.behind_by} ${comparisonBranch} commit(s) in the baseline are missing from the PR build`,
            );
          }
          const guidance =
            comparison.behind_by > 0
              ? `Rebase your PR onto the latest ${comparisonBranch} to compare against an up-to-date baseline.`
              : `Re-run once ${comparisonBranch}'s baseline build for ${commitLink(mergedBaseSha)} finishes.`;
          bodyParts.push(
            `⚠️ Baseline mismatch: ${differences.join('; ')}. Their size changes also affect this comparison. ` +
              `[Compare commits](${comparison.html_url}). ${guidance}`,
          );
        }
      } catch (error) {
        core.warning(`Unable to check baseline alignment: ${error.message}`);
        bodyParts.push('⚠️ Unable to verify whether the baseline matches the PR build.');
      }
    }

    let failure;
    if (pr.head.ref.startsWith(RELEASE_BRANCH_PREFIX)) {
      // Release PRs target master, which has no baseline and would include every change since the last release anyway
      core.info('Release PR detected. Reporting bundle sizes without enforcing limits.');
    } else if (!base) {
      failure = 'No baseline size measurements found. Re-run after the base build completes.';
      bodyParts.push(failure);
    } else if (increases.length > 0 && !increaseAccepted) {
      failure =
        `One or more gzipped bundles increased by more than ${MAX_INCREASE_BYTES} bytes. ` +
        `If this increase is intentional, add the **${OVERRIDE_LABEL}** label to this PR to rerun and accept the check.`;
    }

    bodyParts.push(markdownTable(limit.formatResults(base, current)));
    if (baseWorkflowRun) {
      bodyParts.push(`[View base workflow run](${baseWorkflowRun.html_url})`);
    }

    const body = bodyParts.join('\n\n');
    await core.summary.addRaw(body).write();

    try {
      const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        ...repo,
        issue_number: pr.number,
        per_page: 100,
      });
      const sizeLimitComment = comments.find(comment => comment.body.startsWith(SIZE_LIMIT_HEADING));
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

      if (failure && increases.length > 0 && !comments.some(comment => comment.body === failure)) {
        await octokit.rest.issues.createComment({
          ...repo,
          issue_number: pr.number,
          body: failure,
        });
      }
    } catch {
      core.warning('Unable to update PR comments. The size report is available in the job summary.');
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
