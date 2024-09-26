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

  const {owner, repo} = context.repo;

  const octokit = getOctokit(githubToken);

  const release = await octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
    owner,
    repo,
    tag: version,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });


  const prNumbers = extractPrsFromReleaseBody(release.data.body);

  if(!prNumbers.length) {
    core.debug('No PRs found in release body.');
    return;
  }

  core.debug(`Found PRs in release body: ${prNumbers.join(', ')}`);


  const res = await octokit.graphql(`
    {
      query issuesForPr($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            id
            closingIssuesReferences (first: 50) {
              edges {
                node {
                  id
                  number
                }
              }
            }
          }
        }
      }
    }
  `, {
    prNumber: prNumbers[0],
    owner,
    repo
  });

  const linkedIssues = Promise.all(prNumbers.map((prNumber) => getLinkedIssuesForPr(octokit, { repo, owner, prNumber })));

  console.log(linkedIssues);
}

/**
 *
 * @param {string} body
 * @returns {number[]}
 */
function extractPrsFromReleaseBody(body) {
  const regex = /\[#(\d+)\]\(https:\/\/github\.com\/getsentry\/sentry-javascript\/pull\/(?:\d+)\)/gm;
 const prNumbers = Array.from(new Set([...body.matchAll(regex)].map((match) => parseInt(match[1]))));

 return prNumbers.filter(number => !!number && !Number.isNaN(number));
}

/**
 *
 * @param {ReturnType<import('@actions/github').getOctokit>} octokit
 * @param {{ repo: string, owner: string, prNumber: number}} options
 * @returns {Promise<{id: string, number: number}[]>}
 */
async function getLinkedIssuesForPr(octokit, { repo, owner, prNumber }) {
  const res = await octokit.graphql(`
query issuesForPr($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      id
      closingIssuesReferences (first: 50) {
        edges {
          node {
            id
            number
          }
        }
      }
    }
  }
}`, {
    prNumber,
    owner,
    repo
  });

  return res.data.repository?.pullRequest?.closingIssuesReferences.edges.map(edge => edge.node);
}

run();
