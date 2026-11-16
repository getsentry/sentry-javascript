import { getJuniorRequesters, JUNIOR_LOGIN, TEAM_SLUG } from './junior-requesters.mjs';

export const TEAM_REVIEW_LABEL = 'Waiting for: Team Review';
// Outside collaborators can't be members of a GitHub team, so contractors are listed here instead.
const CONTRACTORS = ['timfish', 'RulaKhaled'];

const sameLogin = (a, b) => a.toLowerCase() === b.toLowerCase();
const hasTeamReviewLabel = pr => pr.labels.some(label => label.name === TEAM_REVIEW_LABEL);

async function getTeamLogins(github, org) {
  const members = await github.paginate(github.rest.teams.listMembersInOrg, { org, team_slug: TEAM_SLUG });
  return members.map(m => m.login);
}

/**
 * Junior opens PRs as a bot, so whoever asked for one can approve it. Unless every requester is on the SDK team, the PR
 * gets a label that blocks merging until the team or a contractor approves it.
 */
export async function labelJuniorPrForTeamReview({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (pr.user.login !== JUNIOR_LOGIN) {
    return;
  }

  const requesters = await getJuniorRequesters({ github, core, pr });
  const team = await getTeamLogins(github, owner);
  if (requesters.length && requesters.every(login => team.some(member => sameLogin(member, login)))) {
    core.info(`Requested by SDK team members (${requesters.join(', ')}), no team review needed.`);
    return;
  }

  core.info(
    `Requesters (${requesters.join(', ') || 'none'}) are not all on the SDK team, adding "${TEAM_REVIEW_LABEL}".`,
  );
  await github.rest.issues.addLabels({ owner, repo, issue_number: pull_number, labels: [TEAM_REVIEW_LABEL] });
}

/** Removes the label once someone on the SDK team or a contractor approves, unless they authored or requested the PR. */
export async function clearTeamReviewLabel({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;
  const { review } = context.payload;

  if (review.state !== 'approved') {
    return;
  }

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (!hasTeamReviewLabel(pr)) {
    return;
  }

  const reviewer = review.user.login;
  const requesters = await getJuniorRequesters({ github, core, pr });
  if ([pr.user.login, ...requesters].some(login => sameLogin(login, reviewer))) {
    core.info(`${reviewer} authored or requested this PR, so their approval doesn't count.`);
    return;
  }

  const trusted = [...CONTRACTORS, ...(await getTeamLogins(github, owner))];
  if (!trusted.some(login => sameLogin(login, reviewer))) {
    core.info(`${reviewer} is neither on the SDK team nor a contractor, keeping "${TEAM_REVIEW_LABEL}".`);
    return;
  }

  core.info(`Approved by ${reviewer}, removing "${TEAM_REVIEW_LABEL}".`);
  await github.rest.issues.removeLabel({ owner, repo, issue_number: pull_number, name: TEAM_REVIEW_LABEL });
}

/**
 * Required check that fails while the PR has the label. A person removing the label by hand doesn't count: only the
 * workflow that sees the approval may remove it.
 */
export async function enforceTeamReviewGate({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;
  const { action, label, sender } = context.payload;
  const failure = `This PR needs an approval from @getsentry/${TEAM_SLUG} or a contractor, which removes the "${TEAM_REVIEW_LABEL}" label.`;

  if (action === 'unlabeled' && label?.name === TEAM_REVIEW_LABEL && sender.type !== 'Bot') {
    core.info(`${sender.login} removed "${TEAM_REVIEW_LABEL}" by hand, adding it back.`);
    await github.rest.issues.addLabels({ owner, repo, issue_number: pull_number, labels: [TEAM_REVIEW_LABEL] });
    core.setFailed(failure);
    return;
  }

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (hasTeamReviewLabel(pr)) {
    core.setFailed(failure);
  }
}
