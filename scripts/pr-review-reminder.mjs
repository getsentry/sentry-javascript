/**
 * PR Review Reminder script.
 *
 * Posts reminder comments on open PRs whose requested reviewers have not
 * responded within 2 business days. Re-nags every 2 business days thereafter
 * until the review is submitted (or the request is removed).
 *
 * Business days exclude weekends and public holidays for US, CA, and AT
 * (fetched at runtime from the Nager.Date API).
 *
 * Intended to be called from a GitHub Actions workflow via actions/github-script:
 *
 *   const { default: run } = await import(
 *     `${process.env.GITHUB_WORKSPACE}/scripts/pr-review-reminder.mjs`
 *   );
 *   await run({ github, context, core });
 */

// ---------------------------------------------------------------------------
// Public holidays (US, Canada, Austria) via Nager.Date — free, no API key.
// See https://date.nager.at/ for documentation and supported countries.
// We fetch the current year and the previous year so that reviews requested
// in late December are handled correctly when the workflow runs in January.
// If the API is unreachable we fall back to weekday-only checking and warn.
// ---------------------------------------------------------------------------

const COUNTRY_CODES = ['US', 'CA', 'AT'];

async function fetchHolidaysForYear(year, core) {
  const dates = new Set();
  for (const cc of COUNTRY_CODES) {
    try {
      const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`);
      if (!resp.ok) {
        core.warning(`Nager.Date returned ${resp.status} for ${cc}/${year}`);
        continue;
      }
      const holidays = await resp.json();
      for (const h of holidays) {
        dates.add(h.date); // 'YYYY-MM-DD'
      }
    } catch (e) {
      core.warning(`Failed to fetch holidays for ${cc}/${year}: ${e.message}`);
    }
  }
  return dates;
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

function countElapsedBusinessDays(requestedAt, now, publicHolidays) {
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
      const dateStr = cursor.toISOString().slice(0, 10);
      if (!publicHolidays.has(dateStr)) {
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

  // Fetch public holidays
  const currentYear = now.getUTCFullYear();
  const [currentYearHolidays, previousYearHolidays] = await Promise.all([
    fetchHolidaysForYear(currentYear, core),
    fetchHolidaysForYear(currentYear - 1, core),
  ]);
  const publicHolidays = new Set([...currentYearHolidays, ...previousYearHolidays]);

  core.info(`Loaded ${publicHolidays.size} public holiday dates for ${currentYear - 1}–${currentYear}`);

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

    const pendingReviewers = requested.reviewers; // individual users
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
      return countElapsedBusinessDays(anchor, now, publicHolidays) >= 2;
    }

    // Collect overdue individual reviewers
    const toRemind = []; // { key, mention }

    for (const reviewer of pendingReviewers) {
      const requestEvents = timeline
        .filter(
          e => e.event === 'review_requested' && e.requested_reviewer?.login === reviewer.login,
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (requestEvents.length === 0) continue;

      const requestedAt = new Date(requestEvents[0].created_at);
      if (!needsReminder(requestedAt, reviewer.login)) continue;

      toRemind.push({ key: reviewer.login, mention: `@${reviewer.login}` });
    }

    // Collect overdue team reviewers
    for (const team of pendingTeams) {
      const requestEvents = timeline
        .filter(e => e.event === 'review_requested' && e.requested_team?.slug === team.slug)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (requestEvents.length === 0) continue;

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
    const body = `${markers}\n👋 ${mentions} — a friendly reminder that your review on this PR is still pending. Could you please take a look when you get a chance? Thank you!`;

    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body,
    });

    core.info(`Posted review reminder on PR #${pr.number} for: ${mentions}`);
  }
}
