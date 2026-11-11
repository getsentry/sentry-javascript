import * as fs from 'fs';

const REQUIRED_REVIEWERS = 3;
const TEAM_SLUG = 'team-javascript-sdks';
// Managers who are members (and code owners) of the SDK teams, but should never be auto-requested for review.
const NEVER_REQUEST = ['mydea', 'stephanie-anderson'];
const CODEOWNERS_PATH = '.github/CODEOWNERS';
const JUNIOR_LOGIN = 'sentry-junior[bot]';
// Junior writes `via **Slack Name**` when the requester has no GitHub account linked in Junior. These people's
// GitHub profile name can't be matched to their Slack name.
const JUNIOR_NAME_TO_LOGIN = {
  'isaac schlueter': 'isaacs',
};

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

function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads the requesters from the attribution block Junior adds to the bodies of PRs it opens. A requester is
 * `@login` when they linked their GitHub account in Junior, otherwise `**Slack Name**`. Automation runs have no
 * human requester and are skipped.
 */
export function parseJuniorRequesters(body) {
  const block = body?.match(
    /<!-- junior-request-attribution:start -->([\s\S]*?)<!-- junior-request-attribution:end -->/,
  );
  if (!block) {
    return [];
  }

  return block[1]
    .trim()
    .replace(/\.$/, '')
    .replace(/^via\s+/i, '')
    .split(/,\s*(?=\*\*|@|\[?automation `|via\s)/i)
    .map(label => label.trim().replace(/^via\s+/i, ''))
    .map(label => {
      const login = label.match(/^@([A-Za-z0-9][A-Za-z0-9_-]*)$/)?.[1];
      if (login) {
        return { login };
      }
      const name = label.match(/^\*\*(.+)\*\*$/)?.[1];
      return name ? { name: name.replaceAll('\\*', '*') } : undefined;
    })
    .filter(Boolean);
}

/**
 * Maps a Slack name to a GitHub login by comparing it with the GitHub profile names of `members`. A single-word
 * profile name (e.g. `Sigrid`) matches the first name, as long as only one member has it.
 */
export function resolveLoginByName(name, members) {
  const normalized = normalizeName(name);
  if (JUNIOR_NAME_TO_LOGIN[normalized]) {
    return JUNIOR_NAME_TO_LOGIN[normalized];
  }

  const named = members.filter(m => m.name).map(m => ({ login: m.login, name: normalizeName(m.name) }));
  const exact = named.filter(m => m.name === normalized);
  if (exact.length === 1) {
    return exact[0].login;
  }

  const firstName = normalized.split(' ')[0];
  const byFirstName = named.filter(m => !m.name.includes(' ') && m.name === firstName);
  return byFirstName.length === 1 ? byFirstName[0].login : undefined;
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
  if (currentPr.state !== 'open') {
    core.info('PR is not open, skipping.');
    return;
  }

  const listTeamMembers = async team_slug =>
    (await github.paginate(github.rest.teams.listMembersInOrg, { org: owner, team_slug })).map(m => m.login);

  const author = currentPr.user.login;
  const requesters =
    author === JUNIOR_LOGIN ? await resolveJuniorRequesters({ github, core, currentPr, listTeamMembers }) : [];

  if (requesters.length && !currentPr.assignees?.length) {
    core.info(`Assigning Junior PR to its requesters: ${requesters.join(', ')}`);
    await github.rest.issues.addAssignees({ owner, repo, issue_number: pull_number, assignees: requesters });
  }

  if (currentPr.draft) {
    core.info('PR is a draft, not requesting reviewers.');
    return;
  }

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

/** Names are only matched against the SDK team, so a Slack name can't resolve to an unrelated GitHub user. */
async function resolveJuniorRequesters({ github, core, currentPr, listTeamMembers }) {
  const parsed = parseJuniorRequesters(currentPr.body);
  let members;
  const logins = [];

  for (const requester of parsed) {
    if (requester.login) {
      logins.push(requester.login);
      continue;
    }
    members ??= await Promise.all(
      (await listTeamMembers(TEAM_SLUG)).map(
        async username => (await github.rest.users.getByUsername({ username })).data,
      ),
    );
    const login = resolveLoginByName(requester.name, members);
    if (login) {
      logins.push(login);
    } else {
      core.info(`Could not map Junior requester "${requester.name}" to a GitHub user.`);
    }
  }

  return [...new Set(logins)];
}
