import * as fs from 'fs';

import { CONTRACTORS, getJuniorRequesters, TEAM_SLUG } from './junior-requesters.mjs';

const REQUIRED_REVIEWERS = 3;
// Managers who are members of the SDK teams, but should never be auto-requested for review.
// GitHub's team auto-assignment can still pick them, so their requests and reviews don't count towards the required reviewers.
const NEVER_REQUEST = ['mydea', 'stephanie-anderson', 'HazAT'];
const REVIEWERS_PATH = '.github/REVIEWERS';
const REVIEW_LOAD_DAYS = 7;

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
      const additive = line.startsWith('+');
      const [pattern, ...owners] = line.replace(/^\+/, '').split(/\s+/);
      return { regexp: patternToRegExp(pattern), owners, additive };
    });
}

/**
 * CODEOWNERS semantics: the last matching rule wins for each file. Rules prefixed with `+` are an extension: they
 * never win, but add their owners on top of the winning rule.
 */
export function getOwnersForFiles(rules, files) {
  const owners = new Set();
  for (const file of files) {
    const matching = rules.filter(r => r.regexp.test(file));
    const winner = matching.findLast(r => !r.additive);
    for (const rule of [winner, ...matching.filter(r => r.additive)]) {
      rule?.owners.forEach(owner => owners.add(owner));
    }
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
 * to the whole team plus the contractors. Within a pool, people who were asked for the fewest reviews recently
 * (`load`, keyed by lowercase login) go first, ties are broken randomly. Logins are compared case-insensitively,
 * as GitHub does.
 */
export function pickReviewers({ existing, codeownerPool, teamPool, exclude, load = new Map() }) {
  const taken = new Set([...existing, ...exclude].map(login => login.toLowerCase()));
  const picked = [];
  const loadOf = login => load.get(login.toLowerCase()) ?? 0;

  for (const pool of [codeownerPool, teamPool]) {
    for (const login of shuffle(pool).sort((a, b) => loadOf(a) - loadOf(b))) {
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

/**
 * Returns the logins that set their GitHub status to busy ("limited availability"). GitHub's own team review
 * assignment skips these users too. User status is only exposed via GraphQL.
 */
export async function getBusyLogins({ github, core, logins }) {
  const unique = [...new Map(logins.map(login => [login.toLowerCase(), login])).values()];
  if (!unique.length) {
    return [];
  }

  const query = `query(${unique.map((_, i) => `$l${i}: String!`).join(', ')}) {
    ${unique.map((_, i) => `u${i}: user(login: $l${i}) { login status { indicatesLimitedAvailability } }`).join('\n    ')}
  }`;
  const variables = Object.fromEntries(unique.map((login, i) => [`l${i}`, login]));

  try {
    const data = await github.graphql(query, variables);
    return Object.values(data)
      .filter(user => user?.status?.indicatesLimitedAvailability)
      .map(user => user.login);
  } catch (error) {
    core.warning(`Could not read reviewer availability, not skipping busy users: ${error.message}`);
    return [];
  }
}

// Keep the page small: with larger pages (50+ PRs), GitHub silently returns empty `timelineItems` for some PRs.
const REVIEW_REQUESTS_QUERY = `query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: 25, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        updatedAt
        timelineItems(first: 100, itemTypes: [REVIEW_REQUESTED_EVENT, REVIEW_REQUEST_REMOVED_EVENT]) {
          nodes {
            __typename
            ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } }
            ... on ReviewRequestRemovedEvent { createdAt requestedReviewer { ... on User { login } } }
          }
        }
      }
    }
  }
}`;

/**
 * Fetches the PRs updated since `since`. PRs come newest-updated first, and requesting a review updates a PR, so
 * paging stops at the first PR updated before `since`: neither it nor any later PR can have a request in the window.
 */
async function getPrsUpdatedSince({ github, owner, repo, since }) {
  const prs = [];
  let cursor = null;
  for (;;) {
    const { repository } = await github.graphql(REVIEW_REQUESTS_QUERY, { owner, repo, cursor });
    const { nodes, pageInfo } = repository.pullRequests;
    const updated = nodes.filter(pr => Date.parse(pr.updatedAt) >= since);
    prs.push(...updated);
    if (!pageInfo.hasNextPage || updated.length < nodes.length) {
      return prs;
    }
    cursor = pageInfo.endCursor;
  }
}

/**
 * Returns the lowercase logins asked to review `pr` since `since`. Timeline events are in order, so removing a
 * request cancels it, e.g. when someone was requested by mistake. Team requests have no login and are skipped.
 */
function getRecentReviewers(pr, since) {
  const reviewers = new Set();
  for (const event of pr.timelineItems.nodes) {
    const login = event.requestedReviewer?.login?.toLowerCase();
    if (!login || Date.parse(event.createdAt) < since) {
      continue;
    }
    if (event.__typename === 'ReviewRequestedEvent') {
      reviewers.add(login);
    } else {
      reviewers.delete(login);
    }
  }
  return reviewers;
}

/**
 * Returns how many PRs each user was asked to review in the last `REVIEW_LOAD_DAYS`, keyed by lowercase login.
 * This counts what people were handed rather than their open queue, so working through reviews quickly doesn't
 * attract more of them.
 */
export async function getReviewLoad({ github, core, owner, repo, now = Date.now() }) {
  const since = now - REVIEW_LOAD_DAYS * 24 * 60 * 60 * 1000;
  const load = new Map();
  try {
    for (const pr of await getPrsUpdatedSince({ github, owner, repo, since })) {
      for (const login of getRecentReviewers(pr, since)) {
        load.set(login, (load.get(login) ?? 0) + 1);
      }
    }
  } catch (error) {
    core.warning(`Could not read recent review requests, not balancing reviewer load: ${error.message}`);
  }
  return load;
}

/**
 * A PR is approved when a human's latest approval or change request is an approval. Reviews come oldest first,
 * comments don't change a reviewer's verdict, and a dismissed approval no longer counts.
 */
export function isApproved(reviews) {
  const verdicts = new Map();
  for (const review of reviews) {
    if (review.user && review.user.type !== 'Bot' && review.state !== 'COMMENTED') {
      verdicts.set(review.user.login.toLowerCase(), review.state);
    }
  }
  return [...verdicts.values()].includes('APPROVED');
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

  // The people who own the PR comment on it while iterating, and that isn't a review.
  const notReviewers = [author, ...requesters, ...currentPr.assignees.map(user => user.login), ...NEVER_REQUEST];
  const notCounted = new Set(notReviewers.map(login => login.toLowerCase()));

  const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number });
  if (isApproved(reviews)) {
    core.info('PR is already approved, not requesting reviews.');
    return;
  }

  // Requested reviewers drop off `requested_reviewers` once they submit a review, so count both.
  // Bots (AI reviewers) don't count towards the required reviewers.
  const existing = [
    ...new Set(
      [...currentPr.requested_reviewers, ...reviews.map(r => r.user)]
        .filter(user => user && user.type !== 'Bot' && !notCounted.has(user.login.toLowerCase()))
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
  const codeowners = getOwnersForFiles(parseCodeowners(fs.readFileSync(REVIEWERS_PATH, 'utf8')), files);

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

  const teamPool = [...(await listTeamMembers(TEAM_SLUG)), ...CONTRACTORS];
  const busy = await getBusyLogins({ github, core, logins: [...codeownerPool, ...teamPool] });
  const load = await getReviewLoad({ github, core, owner, repo });

  const reviewers = pickReviewers({
    existing,
    codeownerPool,
    teamPool,
    exclude: [...notReviewers, ...busy],
    load,
  });

  core.info(`Codeowners: ${codeowners.join(', ') || '(none)'}`);
  core.info(`Existing reviewers: ${existing.join(', ') || '(none)'}`);
  core.info(`Busy, skipped: ${busy.join(', ') || '(none)'}`);

  if (!reviewers.length) {
    core.info('No eligible reviewers left to request.');
    return;
  }

  core.info(
    `Requesting reviews from: ${reviewers.map(login => `${login} (${load.get(login.toLowerCase()) ?? 0} recent)`).join(', ')}`,
  );
  await github.rest.pulls.requestReviewers({ owner, repo, pull_number, reviewers });
}
