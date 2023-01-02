import * as fs from 'fs';
import { Octokit } from "@octokit/rest";
import { Git } from './git.js';
import path from 'path';
import Axios from 'axios';
import extract from 'extract-zip';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  // log: console,
});

const [_, owner, repo] = (await Git.repository).split('/');
const defaultArgs = { owner: owner, repo: repo }

export function downloadArtifact(url: string, path: string) {
  const writer = fs.createWriteStream(path);
  return Axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
    }
  }).then(response => {
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error: Error;
      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) resolve(true);
      });
    });
  });
}

export const GitHub = {
  writeOutput(name: string, value: any): void {
    if (typeof process.env.GITHUB_OUTPUT == 'string' && process.env.GITHUB_OUTPUT.length > 0) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
    console.log(`Output ${name} = ${value}`);
  },

  downloadPreviousArtifact(branch: string, targetDir: string, artifactName: string): Promise<void> {
    return (async () => {
      fs.mkdirSync(targetDir, { recursive: true });

      const workflow = (await octokit.actions.listRepoWorkflows(defaultArgs))
        .data.workflows.find((w) => w.name == process.env.GITHUB_WORKFLOW);
      if (workflow == undefined) {
        console.log(
          `Skipping previous artifact '${artifactName}' download for branch '${branch}' - not running in CI?`,
          "Environment variable GITHUB_WORKFLOW isn't set."
        );
        return;
      }
      console.log(`Trying to download previous artifact '${artifactName}' for branch '${branch}'`);

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

      const artifact = (await octokit.actions.listWorkflowRunArtifacts({
        ...defaultArgs,
        run_id: workflowRuns.data.workflow_runs[0].id,
      })).data.artifacts.find((it) => it.name == artifactName);

      if (artifact == undefined) {
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
    })();
  },

  //       fun addOrUpdateComment(commentBuilder: PrCommentBuilder) {
  //   if (pullRequest == null) {
  //               val file = File("out/comment.html")
  //     println("No PR available (not running in CI?): writing built comment to ${file.absolutePath}")
  //     file.writeText(commentBuilder.body)
  //   } else {
  //               val comments = pullRequest!!.comments
  //               // Trying to fetch `github!!.myself` throws (in CI only): Exception in thread "main" org.kohsuke.github.HttpException:
  //               //   {"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/reference/users#get-the-authenticated-user"}
  //               // Let's make this conditional on some env variable that's unlikely to be set.
  //               // Do not use "CI" because that's commonly set during local development and testing.
  //               val author = if (env.containsKey("GITHUB_ACTION")) "github-actions[bot]" else github!!.myself.login
  //               val comment = comments.firstOrNull {
  //       it.user.login.equals(author) &&
  //         it.body.startsWith(commentBuilder.title, ignoreCase = true)
  //     }
  //     if (comment != null) {
  //       println("Updating PR comment ${comment.htmlUrl} body")
  //       comment.update(commentBuilder.body)
  //     } else {
  //       println("Adding new PR comment to ${pullRequest!!.htmlUrl}")
  //       pullRequest!!.comment(commentBuilder.body)
  //     }
  //   }
  // }
}
