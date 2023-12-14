import * as fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import axios from 'axios';
import extract from 'extract-zip';

import type { PrCommentBuilder } from '../results/pr-comment.js';
import { consoleGroup } from './console.js';
import { Git } from './git.js';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  // log: console,
});

const [, owner, repo] = (await Git.repository).split('/');
const defaultArgs = { owner, repo };

async function downloadArtifact(url: string, path: string): Promise<void> {
  const writer = fs.createWriteStream(path);
  return axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
  }).then(response => {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      response.data.pipe(writer);
      let error: Error;
      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) resolve();
      });
    });
  });
}

async function tryAddOrUpdateComment(commentBuilder: PrCommentBuilder): Promise<boolean> {
  /* Env var GITHUB_REF is only set if a branch or tag is available for the current CI event trigger type.
    The ref given is fully-formed, meaning that
      * for branches the format is refs/heads/<branch_name>,
      * for pull requests it is refs/pull/<pr_number>/merge,
      * and for tags it is refs/tags/<tag_name>.
    For example, refs/heads/feature-branch-1.
  */
  let prNumber: number | undefined;
  if (
    typeof process.env.GITHUB_REF == 'string' &&
    process.env.GITHUB_REF.length > 0 &&
    process.env.GITHUB_REF.startsWith('refs/pull/')
  ) {
    prNumber = parseInt(process.env.GITHUB_REF.split('/')[2]);
    console.log(
      `Determined PR number ${prNumber} based on GITHUB_REF environment variable: '${process.env.GITHUB_REF}'`,
    );
  } else if (!(await Git.branchIsBase)) {
    prNumber = (
      await octokit.rest.pulls.list({
        ...defaultArgs,
        base: await Git.baseBranch,
        head: await Git.branch,
      })
    ).data[0]?.number;
    if (prNumber != undefined) {
      console.log(`Found PR number ${prNumber} based on base and head branches`);
    }
  }

  if (prNumber === undefined) return false;

  // Determine the PR comment author:
  // Trying to fetch `octokit.users.getAuthenticated()` throws (in CI only):
  //   {"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/reference/users#get-the-authenticated-user"}
  // Let's make this conditional on some env variable that's unlikely to be set locally but will be set in GH Actions.
  // Do not use "CI" because that's commonly set during local development and testing.
  const author =
    typeof process.env.GITHUB_ACTION == 'string'
      ? 'github-actions[bot]'
      : (await octokit.users.getAuthenticated()).data.login;

  // Try to find an existing comment by the author and title.
  const comment = await (async () => {
    for await (const comments of octokit.paginate.iterator(octokit.rest.issues.listComments, {
      ...defaultArgs,
      issue_number: prNumber,
    })) {
      const found = comments.data.find(comment => {
        return (
          comment.user?.login == author && comment.body != undefined && comment.body.indexOf(commentBuilder.title) >= 0
        );
      });
      if (found) return found;
    }
    return undefined;
  })();

  if (comment !== undefined) {
    console.log(`Updating PR comment ${comment.html_url} body`);
    await octokit.rest.issues.updateComment({
      ...defaultArgs,
      comment_id: comment.id,
      body: commentBuilder.body,
    });
  } else {
    console.log(`Adding a new comment to PR ${prNumber}`);
    await octokit.rest.issues.createComment({
      ...defaultArgs,
      issue_number: prNumber,
      body: commentBuilder.body,
    });
  }

  return true;
}

export const GitHub = {
  writeOutput(name: string, value: string): void {
    if (typeof process.env.GITHUB_OUTPUT == 'string' && process.env.GITHUB_OUTPUT.length > 0) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
    console.log(`Output ${name} = ${value}`);
  },

  downloadPreviousArtifact(branch: string, targetDir: string, artifactName: string): Promise<void> {
    console.log(`Trying to download previous artifact '${artifactName}' for branch '${branch}'`);
    return consoleGroup(async () => {
      fs.mkdirSync(targetDir, { recursive: true });

      const workflow = await (async () => {
        for await (const workflows of octokit.paginate.iterator(octokit.rest.actions.listRepoWorkflows, defaultArgs)) {
          const found = workflows.data.find(w => w.name == process.env.GITHUB_WORKFLOW);
          if (found) return found;
        }
        return undefined;
      })();
      if (workflow === undefined) {
        console.log(
          `Skipping previous artifact '${artifactName}' download for branch '${branch}' - not running in CI?`,
          "Environment variable GITHUB_WORKFLOW isn't set.",
        );
        return;
      }

      const workflowRuns = await octokit.actions.listWorkflowRuns({
        ...defaultArgs,
        workflow_id: workflow.id,
        branch: branch,
        status: 'success',
      });

      if (workflowRuns.data.total_count == 0) {
        console.warn(`Couldn't find any successful run for workflow '${workflow.name}'`);
        return;
      }

      const artifact = (
        await octokit.actions.listWorkflowRunArtifacts({
          ...defaultArgs,
          run_id: workflowRuns.data.workflow_runs[0].id,
        })
      ).data.artifacts.find(it => it.name == artifactName);

      if (artifact === undefined) {
        console.warn(`Couldn't find any artifact matching ${artifactName}`);
        return;
      }

      console.log(`Downloading artifact ${artifact.archive_download_url} and extracting to ${targetDir}`);

      const tempFilePath = path.resolve(targetDir, '../tmp-artifacts.zip');
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      try {
        await downloadArtifact(artifact.archive_download_url, tempFilePath);
        await extract(tempFilePath, { dir: path.resolve(targetDir) });
      } finally {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    });
  },

  async addOrUpdateComment(commentBuilder: PrCommentBuilder): Promise<void> {
    console.log('Adding/updating PR comment');
    return consoleGroup(async () => {
      let successful = false;
      try {
        successful = await tryAddOrUpdateComment(commentBuilder);
      } finally {
        if (!successful) {
          const file = 'out/comment.html';
          console.log(`Writing built comment to ${path.resolve(file)}`);
          fs.writeFileSync(file, commentBuilder.body);
        }
      }
    });
  },
};
