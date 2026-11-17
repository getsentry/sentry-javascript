import { CONTRACTORS, getJuniorRequesters, JUNIOR_LOGIN, TEAM_SLUG } from './junior-requesters.mjs';

export const TEAM_REVIEW_LABEL = 'Waiting for: Team Review';
// Only the app that clears the label after a qualifying review may remove it.
const GITFLOW_APP_LOGIN = 'javascript-sdk-gitflow[bot]';

const sameLogin = (a, b) => a.toLowerCase() === b.toLowerCase();
const hasTeamReviewLabel = pr => pr.labels.some(label => label.name === TEAM_REVIEW_LABEL);

async function getTrustedLogins(github, org) {
  const members = await github.paginate(github.rest.teams.listMembersInOrg, { org, team_slug: TEAM_SLUG });
  return [...CONTRACTORS, ...members.map(m => m.login)];
}

const isTrusted = (trusted, login) => trusted.some(trustedLogin => sameLogin(trustedLogin, login));

/**
 * Junior opens PRs as a bot, so whoever asked for one can approve it. Unless every requester is on the SDK team or a
 * contractor, the PR gets a label that blocks merging until the team or a contractor approves it.
 */
export async function labelJuniorPrForTeamReview({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (pr.user.login !== JUNIOR_LOGIN) {
    return;
  }

  const requesters = await getJuniorRequesters({ github, core, pr });
  const trusted = await getTrustedLogins(github, owner);
  if (requesters.length && requesters.every(login => isTrusted(trusted, login))) {
    core.info(`Requested by SDK team members or contractors (${requesters.join(', ')}), no team review needed.`);
    return;
  }

  core.info(
    `Requesters (${requesters.join(', ') || 'none'}) are not all SDK team members or contractors, adding "${TEAM_REVIEW_LABEL}".`,
  );
  await github.rest.issues.addLabels({ owner, repo, issue_number: pull_number, labels: [TEAM_REVIEW_LABEL] });
}

/** Removes the label once someone on the SDK team or a contractor approves. */
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
  if (!isTrusted(await getTrustedLogins(github, owner), reviewer)) {
    core.info(`${reviewer} is neither on the SDK team nor a contractor, keeping "${TEAM_REVIEW_LABEL}".`);
    return;
  }

  core.info(`Approved by ${reviewer}, removing "${TEAM_REVIEW_LABEL}".`);
  await github.rest.issues.removeLabel({ owner, repo, issue_number: pull_number, name: TEAM_REVIEW_LABEL });
}

/**
 * Required check that fails while the PR has the label. Removing the label by hand doesn't count: only the workflow
 * that sees the approval may remove it.
 */
export async function enforceTeamReviewGate({ github, context, core }) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;
  const { action, label, sender } = context.payload;
  const failure = `This PR needs an approval from @getsentry/${TEAM_SLUG} or a contractor, which removes the "${TEAM_REVIEW_LABEL}" label.`;

  if (action === 'unlabeled' && label?.name === TEAM_REVIEW_LABEL && sender.login !== GITFLOW_APP_LOGIN) {
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
