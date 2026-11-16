export const TEAM_SLUG = 'team-javascript-sdks';
const JUNIOR_LOGIN = 'sentry-junior[bot]';
// Junior writes `via **Slack Name**` when the requester has no GitHub account linked in Junior. These people's
// GitHub profile name can't be matched to their Slack name.
const JUNIOR_NAME_TO_LOGIN = {
  'isaac schlueter': 'isaacs',
};

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

/**
 * Returns the GitHub logins of the people who asked Junior for this PR, or nothing for other PRs. Names are only
 * matched against the SDK team, so a Slack name can't resolve to an unrelated GitHub user.
 */
export async function getJuniorRequesters({ github, core, pr }) {
  if (pr.user.login !== JUNIOR_LOGIN) {
    return [];
  }

  let members;
  const logins = [];

  for (const requester of parseJuniorRequesters(pr.body)) {
    if (requester.login) {
      logins.push(requester.login);
      continue;
    }
    members ??= await Promise.all(
      (
        await github.paginate(github.rest.teams.listMembersInOrg, {
          org: pr.base.repo.owner.login,
          team_slug: TEAM_SLUG,
        })
      ).map(async ({ login }) => (await github.rest.users.getByUsername({ username: login })).data),
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

export async function assignJuniorRequesters({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (pr.assignees.length) {
    core.info(`PR is already assigned to ${pr.assignees.map(a => a.login).join(', ')}, not changing anything.`);
    return;
  }

  const requesters = await getJuniorRequesters({ github, core, pr });
  if (!requesters.length) {
    core.info('No Junior requesters to assign.');
    return;
  }

  core.info(`Assigning PR to: ${requesters.join(', ')}`);
  await github.rest.issues.addAssignees({ owner, repo, issue_number: pull_number, assignees: requesters });
}
