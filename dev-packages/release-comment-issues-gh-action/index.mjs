import * as core from '@actions/core';
import {  context, getOctokit } from '@actions/github';

async function run() {
  const { getInput } = core;

  const githubToken = getInput('github_token');
  const version  = getInput('version');

  if (!githubToken || !version) {
    core.debug('Skipping because github_token or version are empty.');
    return;
  }

  const {  repo } = context;
  const {owner} = repo;

  const octokit = getOctokit(githubToken);

  const release = await octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
    owner,
    repo,
    tag: version,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  console.log(release);
}

run();
