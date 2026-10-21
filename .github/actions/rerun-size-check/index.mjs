import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import rerunSizeCheck from './rerun.mjs';

async function run() {
  try {
    const github = getOctokit(core.getInput('github_token', { required: true }));
    await rerunSizeCheck({ github, context, core });
  } catch (error) {
    core.setFailed(error.message);
  }
}

void run();
