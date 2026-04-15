/**
 * PR Review Reminder script.
 *
 * Posts reminder comments on open PRs whose requested reviewers have not
 * responded within 2 business days. Re-nags every 2 business days thereafter
 * until the review is submitted (or the request is removed).
 *
 * @mentions are narrowed as follows:
 * - Individual users: not [outside collaborators](https://docs.github.com/en/organizations/managing-outside-collaborators)
 *   on this repo (via `repos.listCollaborators` with `affiliation: outside` — repo-scoped, no extra token).
 * - Team reviewers: only the org team `team-javascript-sdks` (by slug).
 *
 * Business days exclude weekends and a small set of recurring public holidays
 * (same calendar date each year) for US, CA, and AT.
 *
 * Intended to be called from a GitHub Actions workflow via actions/github-script:
 *
 *   const { default: run } = await import(
 *     `${process.env.GITHUB_WORKSPACE}/scripts/pr-review-reminder.mjs`
 *   );
 *   await run({ github, context, core });
 */

// Team @mentions only for this slug. Individuals are filtered using outside-collaborator list (see below).
const SDK_TEAM_SLUG = 'team-javascript-sdks';

// ---------------------------------------------------------------------------
// Outside collaborators (repo API — works with default GITHUB_TOKEN).
// Org members with access via teams or default permissions are not listed here.
// ---------------------------------------------------------------------------

async function loadOutsideCollaboratorLogins(github, owner, repo, core) {
  try {
    const users = await github.paginate(github.rest.repos.listCollaborators, {
      owner,
      repo,
      affiliation: 'outside',
      per_page: 100,
    });
    return new Set(users.map(u => u.login));
  } catch (e) {
    const status = e.response?.status;
    core.warning(
      `Could not list outside collaborators for ${owner}/${repo} (${status ? `HTTP ${status}` : 'no status'}): ${e.message}. ` +
        'Skipping @mentions for individual reviewers (team reminders unchanged).',
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Recurring public holidays (month–day in UTC, same date every year).
// A calendar day counts as a holiday if it appears in any country list.
// ---------------------------------------------------------------------------

const RECURRING_PUBLIC_HOLIDAYS_AT = [
  '01-01',
  '01-06',
  '05-01',
  '08-15',
  '10-26',
  '11-01',
  '12-08',
  '12-24',
  '12-25',
  '12-26',
  '12-31',
];

const RECURRING_PUBLIC_HOLIDAYS_CA = ['01-01', '07-01', '09-30', '11-11', '12-24', '12-25', '12-26', '12-31'];

const RECURRING_PUBLIC_HOLIDAYS_US = ['01-01', '06-19', '07-04', '11-11', '12-24', '12-25', '12-26', '12-31'];

const RECURRING_PUBLIC_HOLIDAY_MM_DD = new Set([
  ...RECURRING_PUBLIC_HOLIDAYS_AT,
  ...RECURRING_PUBLIC_HOLIDAYS_CA,
  ...RECURRING_PUBLIC_HOLIDAYS_US,
]);

function monthDayUTC(date) {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Business-day counter.
// Counts fully-elapsed business days (Mon–Fri, not a public holiday) between
// requestedAt and now. "Fully elapsed" means the day has completely passed,
// so today is not included — giving the reviewer the rest of today to respond.
//
// Example: review requested Friday → elapsed complete days include Sat, Sun,
// Mon, Tue, … The first two business days are Mon and Tue, so the reminder
// fires on Wednesday morning. That gives the reviewer all of Monday and
// Tuesday to respond.
// ---------------------------------------------------------------------------

function countElapsedBusinessDays(requestedAt, now) {
  // Walk from the day after the request up to (but not including) today.
  const start = new Date(requestedAt);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);

  const todayUTC = new Date(now);
  todayUTC.setUTCHours(0, 0, 0, 0);

  let count = 0;
  const cursor = new Date(start);
  while (cursor < todayUTC) {
    const dow = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) {
      if (!RECURRING_PUBLIC_HOLIDAY_MM_DD.has(monthDayUTC(cursor))) {
        count++;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Reminder marker helpers
// ---------------------------------------------------------------------------

// Returns a unique HTML comment marker for a reviewer key (login or "team:slug").
// Used for precise per-reviewer deduplication in existing comments.
function reminderMarker(key) {
  return `<!-- review-reminder:${key} -->`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export default async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const now = new Date();

  core.info(`Using ${RECURRING_PUBLIC_HOLIDAY_MM_DD.size} recurring public holiday month–day values (US/CA/AT union)`);

  const outsideCollaboratorLogins = await loadOutsideCollaboratorLogins(github, owner, repo, core);
  if (outsideCollaboratorLogins) {
    core.info(`Excluding ${outsideCollaboratorLogins.size} outside collaborator login(s) from individual @mentions`);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  // Fetch all open PRs
  const prs = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  core.info(`Found ${prs.length} open PRs`);

  for (const pr of prs) {
    // Skip draft PRs and PRs opened by bots
    if (pr.draft) continue;
    if (pr.user?.type === 'Bot') continue;

    // Get currently requested reviewers (only those who haven't reviewed yet —
    // GitHub automatically removes a reviewer from this list once they submit a review)
    const { data: requested } = await github.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number: pr.number,
    });

    const pendingReviewers = requested.users; // individual users
    const pendingTeams = requested.teams; // team reviewers
    if (pendingReviewers.length === 0 && pendingTeams.length === 0) continue;

    // Fetch the PR timeline to determine when each review was (last) requested
    const timeline = await github.paginate(github.rest.issues.listEventsForTimeline, {
      owner,
      repo,
      issue_number: pr.number,
      per_page: 100,
    });

    // Fetch existing comments so we can detect previous reminders
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pr.number,
      per_page: 100,
    });

    const botComments = comments.filter(c => c.user?.login === 'github-actions[bot]');

    // Returns the date of the most recent reminder comment that contains the given marker,
    // or null if no such comment exists.
    function latestReminderDate(key) {
      const marker = reminderMarker(key);
      const matches = botComments
        .filter(c => c.body.includes(marker))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return matches.length > 0 ? new Date(matches[0].created_at) : null;
    }

    // Returns true if a reminder is due for a reviewer/team:
    // - The "anchor" is the later of: the review-request date, or the last
    //   reminder we already posted for this reviewer. This means the
    //   2-business-day clock restarts after every reminder (re-nagging), and
    //   also resets when a new push re-requests the review.
    // - A reminder fires when ≥ 2 full business days have elapsed since the anchor.
    function needsReminder(requestedAt, key) {
      const lastReminded = latestReminderDate(key);
      const anchor = lastReminded && lastReminded > requestedAt ? lastReminded : requestedAt;
      return countElapsedBusinessDays(anchor, now) >= 2;
    }

    // Collect overdue individual reviewers
    const toRemind = []; // { key, mention }

    for (const reviewer of pendingReviewers) {
      const requestEvents = timeline
        .filter(e => e.event === 'review_requested' && e.requested_reviewer?.login === reviewer.login)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (requestEvents.length === 0) {
        core.warning(
          `PR #${pr.number}: pending reviewer @${reviewer.login} has no matching review_requested timeline event; skipping reminder for them.`,
        );
        continue;
      }

      const requestedAt = new Date(requestEvents[0].created_at);
      if (!needsReminder(requestedAt, reviewer.login)) continue;

      if (outsideCollaboratorLogins === null) {
        continue;
      }
      if (outsideCollaboratorLogins.has(reviewer.login)) {
        continue;
      }

      toRemind.push({ key: reviewer.login, mention: `@${reviewer.login}` });
    }

    // Collect overdue team reviewers
    for (const team of pendingTeams) {
      if (team.slug !== SDK_TEAM_SLUG) {
        continue;
      }

      const requestEvents = timeline
        .filter(e => e.event === 'review_requested' && e.requested_team?.slug === team.slug)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (requestEvents.length === 0) {
        core.warning(
          `PR #${pr.number}: pending team reviewer @${owner}/${team.slug} has no matching review_requested timeline event; skipping reminder for them.`,
        );
        continue;
      }

      const requestedAt = new Date(requestEvents[0].created_at);
      const key = `team:${team.slug}`;
      if (!needsReminder(requestedAt, key)) continue;

      toRemind.push({ key, mention: `@${owner}/${team.slug}` });
    }

    if (toRemind.length === 0) continue;

    // Build a single comment that includes per-reviewer markers (for precise dedup
    // on subsequent runs) and @-mentions all overdue reviewers/teams.
    const markers = toRemind.map(({ key }) => reminderMarker(key)).join('\n');
    const mentions = toRemind.map(({ mention }) => mention).join(', ');
    const body = `${markers}\n👋 ${mentions} — Please review this PR when you get a chance!`;

    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body,
    });

    core.info(`Posted review reminder on PR #${pr.number} for: ${mentions}`);
  }
}
