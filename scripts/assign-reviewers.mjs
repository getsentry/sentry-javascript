import * as fs from 'fs';

import { getJuniorRequesters, TEAM_SLUG } from './junior-requesters.mjs';

const REQUIRED_REVIEWERS = 3;
// Managers who are members (and code owners) of the SDK teams, but should never be auto-requested for review.
const NEVER_REQUEST = ['mydea', 'stephanie-anderson'];
const CODEOWNERS_PATH = '.github/CODEOWNERS';

function patternToRegExp(pattern) {
  let p = pattern;
  const anchored = p.startsWith('/') || p.slice(0, -1).includes('/');
  p = p.replace(/^\//, '');
  const directoryOnly = p.endsWith('/');
  p = p.replace(/\/$/, '');

  const body = p
    .split('/')
    .map(segment => {
      if (segment === '**') {
        return '(?:.*)';
      }
      return segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
    })
    .join('/')
    .replace(/\(\?:\.\*\)\//g, '(?:.*/)?');

  const prefix = anchored ? '^' : '^(?:.*/)?';
  const suffix = directoryOnly ? '/.*$' : '(?:/.*)?$';
  return new RegExp(prefix + body + suffix);
}

export function parseCodeowners(content) {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { regexp: patternToRegExp(pattern), owners };
    });
}

/** CODEOWNERS semantics: the last matching rule wins for each file. */
export function getOwnersForFiles(rules, files) {
  const owners = new Set();
  for (const file of files) {
    const rule = rules.findLast(r => r.regexp.test(file));
    rule?.owners.forEach(owner => owners.add(owner));
  }
  return [...owners];
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Picks reviewers to top the PR up to `REQUIRED_REVIEWERS`, preferring the codeowner pool and falling back
 * to the whole team. Logins are compared case-insensitively, as GitHub does.
 */
export function pickReviewers({ existing, codeownerPool, teamPool, exclude }) {
  const taken = new Set([...existing, ...exclude].map(login => login.toLowerCase()));
  const picked = [];

  for (const pool of [codeownerPool, teamPool]) {
    for (const login of shuffle(pool)) {
      if (existing.length + picked.length >= REQUIRED_REVIEWERS) {
        return picked;
      }
      if (!taken.has(login.toLowerCase())) {
        taken.add(login.toLowerCase());
        picked.push(login);
      }
    }
  }

  return picked;
}

export async function assignReviewers({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;

  const { data: currentPr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (currentPr.draft || currentPr.state !== 'open') {
    core.info('PR is a draft or not open, skipping.');
    return;
  }

  const author = currentPr.user.login;
  // Whoever asked Junior for the PR is its de facto author.
  const requesters = await getJuniorRequesters({ github, core, pr: currentPr });

  const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number });
  // Requested reviewers drop off `requested_reviewers` once they submit a review, so count both.
  // Bots (AI reviewers) don't count towards the required reviewers.
  const existing = [
    ...new Set(
      [...currentPr.requested_reviewers, ...reviews.map(r => r.user)]
        .filter(user => user && user.type !== 'Bot' && user.login.toLowerCase() !== author.toLowerCase())
        .map(user => user.login),
    ),
  ];

  if (existing.length >= REQUIRED_REVIEWERS) {
    core.info(`PR already has ${existing.length} reviewers (${existing.join(', ')}), not changing anything.`);
    return;
  }

  const listTeamMembers = async team_slug =>
    (await github.paginate(github.rest.teams.listMembersInOrg, { org: owner, team_slug })).map(m => m.login);

  const files = (await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number })).map(f => f.filename);
  const codeowners = getOwnersForFiles(parseCodeowners(fs.readFileSync(CODEOWNERS_PATH, 'utf8')), files);

  const codeownerPool = [];
  for (const codeowner of codeowners) {
    // `@org/team` or `@user`; email owners can't be requested as reviewers, so they are skipped.
    const [, name, teamSlug] = codeowner.match(/^@([^/]+)(?:\/(.+))?$/) ?? [];
    if (teamSlug && name.toLowerCase() === owner.toLowerCase()) {
      codeownerPool.push(...(await listTeamMembers(teamSlug)));
    } else if (name && !teamSlug) {
      codeownerPool.push(name);
    }
  }

  const reviewers = pickReviewers({
    existing,
    codeownerPool,
    teamPool: await listTeamMembers(TEAM_SLUG),
    exclude: [author, ...requesters, ...NEVER_REQUEST],
  });

  core.info(`Codeowners: ${codeowners.join(', ') || '(none)'}`);
  core.info(`Existing reviewers: ${existing.join(', ') || '(none)'}`);

  if (!reviewers.length) {
    core.info('No eligible reviewers left to request.');
    return;
  }

  core.info(`Requesting reviews from: ${reviewers.join(', ')}`);
  await github.rest.pulls.requestReviewers({ owner, repo, pull_number, reviewers });
}
