---
name: linear-project-status
description: Analyze a Linear project's health and produce a status summary for a project lead or manager. Inspects status-update cadence, lead/owner presence, target-date realism and stability, issue staleness, milestone health, and scope creep. Use whenever the user wants a status report, project review, health check, weekly review, or audit of a Linear project — including phrases like "how is project X going", "give me a status on this Linear project", "audit this project", "is this project on track", "check project health", or when they paste a Linear project URL and ask for a summary. Use it even when the user doesn't explicitly say "audit" or "status" — if the request is fundamentally "tell me how this Linear project is doing", trigger this skill.
argument-hint: <linear-project-url-or-id-or-slug>
---

# Linear Project Status Audit

You are producing a project-health audit for a Linear project. The audience is a project lead or engineering manager who wants both a fast "is this on track?" verdict and a concrete list of process gaps to fix. The skill is designed to be run roughly weekly.

## Input

The user will provide one of:

- A Linear project URL (e.g., `https://linear.app/<workspace>/project/my-project-abc123/overview`)
- A project slug (e.g., `my-project-abc123`)
- A project name or ID

Pass whatever they gave you straight to `get_project`'s `query` parameter — Linear's MCP accepts all three forms. Do not try to parse the URL yourself.

## Data to collect

### Step 1 — Resolve the project UUID first

Linear's MCP has a quirk where `list_issues` and related calls sometimes silently return an empty list when given a slug or name, even though issues exist. To avoid this, always resolve the project to its UUID before doing anything else:

1. Call `mcp__claude_ai_Linear__get_project` once with whatever the user provided (URL, slug, name, or ID) as `query`, plus `includeMembers: true, includeMilestones: true, includeResources: true`.
2. Extract the `id` field from the response — this is the project UUID, e.g. `4cd9abe3-834e-43e4-926e-630e30044c0a`.
3. Use that UUID — never the slug — for every subsequent call in Step 2.

If `get_project` returns no result or an error, stop and tell the user — don't fabricate.

### Step 2 — Fetch the rest of the data in parallel using the UUID

Pass the UUID from Step 1 as the `project` / `projectId` argument to each of these:

1. `mcp__claude_ai_Linear__get_status_updates` with `type: "project", project: <uuid>, limit: 20, orderBy: "createdAt"` — recent status updates, newest first. **Read the bodies.** They often describe target-date changes, scope changes, or blockers that don't show up anywhere else.
2. `mcp__claude_ai_Linear__list_issues` with `project: <uuid>, limit: 250, includeArchived: true` — all current issues. Use `includeArchived: true` (the MCP sometimes filters out non-archived issues otherwise; filter them yourself in analysis if needed). If `hasNextPage` is true, paginate via `cursor` until you have them all (cap at ~1000 to stay reasonable).
3. `mcp__claude_ai_Linear__list_issues` with `project: <uuid>, limit: 100, createdAt: -P30D, orderBy: "createdAt", includeArchived: true` — issues added in the last 30 days, for scope-creep analysis.
4. `mcp__claude_ai_Linear__list_issues` with `project: <uuid>, limit: 100, updatedAt: -P7D, orderBy: "updatedAt", includeArchived: true` — issues that moved this week, for the recent-activity pulse check.
5. `mcp__claude_ai_Linear__list_comments` with `projectId: <uuid>, limit: 30` — recent project-level discussion. Useful for catching live blockers and decisions not yet reflected in updates.

If any call errors, stop and tell the user — don't fabricate.

### Handling large issue lists

For projects with many issues (50+), `list_issues` can return a response too large to fit in a single tool result. If you get a "result exceeds maximum allowed tokens" error pointing to a saved file, use `jq` (via the Bash tool) on that file to aggregate what you need — counts by state, completions in the last 7/30 days, assignees, etc. — rather than trying to read the file line by line. Example: `jq '.issues | group_by(.status) | map({state: .[0].status, count: length}) | .[]' <file>`.

## Analysis dimensions

For each dimension below, derive a verdict (`ok` / `warn` / `bad`) and a one-sentence rationale. Apply the default thresholds but use judgment when the context clearly justifies an override (and say so in the rationale). All "days since" calculations should be relative to today.

### 1. Status update cadence

Goal: project should have weekly updates so stakeholders aren't in the dark.

| Days since last update | Verdict |
| ---------------------- | ------- |
| ≤ 8 days               | ok      |
| 9–14 days              | warn    |
| > 14 days, or none     | bad     |

Don't flag single-author updates. Projects are typically owned by one person and it's fine — even expected — for that person to write all updates. The cadence is what matters, not the authorship distribution.

### 2. Project lead

This dimension is binary — either there's a lead on the project or there isn't:

| Condition                    | Verdict |
| ---------------------------- | ------- |
| `lead` is set on the project | ok      |
| No lead set                  | bad     |

Every project must have a designated lead. Don't try to infer a "de facto lead" from update authorship — the field is either set or it isn't. A missing lead is one of the most common process gaps; flag it visibly.

### 2b. Lead engagement

Separately from the binary "is there a lead" check, evaluate whether the lead is actually doing project work. Surface this as its own line item in the report (e.g., "Lead engagement: warn").

| Condition                                                                | Verdict |
| ------------------------------------------------------------------------ | ------- |
| Lead is assigned to a meaningful share of the project's issues           | ok      |
| Lead is assigned to none or only a tiny fraction of the project's issues | warn    |
| No lead is set (covered by dimension 2; skip this dimension)             | n/a     |

Why: leads should be doing the work, not just owning the project nominally. One person doing the majority of issues is fine — that's how single-owner projects naturally look. The thing to flag is the lead being absent from the work, not other contributors being light.

### 3. Target date — presence and realism

First, check presence — a target date is required on every project:

- No target date → `bad`. An end-state without a date is a backlog, not a project. Always flag this as a top concern.
- Target date set → judge realism (below).

To judge realism, compare days remaining to the open scope. Rough heuristic:

- `bad` if target date is within 14 days AND there are open issues with no recent activity, OR open issues outnumber completed ones.
- `warn` if target date is within 30 days AND >40% of issues are still open, OR the target date is already in the past while the project is not completed.
- `ok` otherwise.

These are anchors, not rules — if status updates say "we're descoping X" or "ship date moved deliberately", weight that.

### 4. Target date stability

A project's target date should change rarely. Each push-out is a small admission that the plan wasn't trusted.

You typically can't query the target-date history directly. Read the status updates and the project description for explicit mentions of date changes. Count distinct dates that have been referenced as "the target".

| Pushes mentioned in recent updates | Verdict |
| ---------------------------------- | ------- |
| 0–1                                | ok      |
| 2                                  | warn    |
| 3+                                 | bad     |

If you can't tell, say so — don't guess. State: "Could not determine target-date history from available data."

### 5. Issue staleness

For each open issue (states: backlog, unstarted, started), compute days since `updatedAt`.

- `bad`: an issue is `started` (In Progress) but hasn't been touched in > 14 days. In-progress work should be finishing, not sitting.
- `warn`: > 30% of open issues haven't been touched in > 21 days.
- `ok`: most open issues moved within the last few weeks.

Backlog-state issues that are stale are less alarming than started-state ones — call them out separately if it matters.

### 6. Milestone health

For each milestone, check the target date and the state of its associated issues. (You may need to look at each issue's milestone via the issue payload; otherwise infer from titles/labels.)

- `bad`: milestone target date in the past AND issues attached are not all completed.
- `warn`: milestone target date in the past AND it's unclear whether the work shipped; OR milestone has no issues attached at all (it's just a date on a calendar).
- `ok`: milestones are in the future, or past ones are clearly done.

A project with no milestones isn't automatically a problem on small projects — but on multi-month projects, the absence of milestones is itself a `warn`.

### 7. Scope stability (issue additions)

Compare issues added in the last 30 days against total open issues, and look at whether new issues are still being added late in the project's life.

- `bad`: target date is < 30 days away AND new issues are still being added at a non-trivial rate.
- `warn`: > 30% of currently-open issues were created in the last 30 days on a project that's been going for months.
- `ok`: rate of new issues is decreasing, or matches expected discovery on a young project.

The point of this check: a project should converge toward a defined end state. A project where issues keep getting added is really a workstream, not a project.

### 8. Recent activity (last 7 days)

Per-issue staleness (dimension 5) tells you whether individual tickets are sitting. This dimension is the project-level pulse: did _anything_ happen this week?

Count issues that were either **completed** or **updated while in a `started` state** in the last 7 days. (Use the `list_issues` `updatedAt: -P7D` filter, or filter the issues you already fetched.)

| Activity in last 7 days                                              | Verdict |
| -------------------------------------------------------------------- | ------- |
| Several issues moved or completed; matches the project's normal pace | ok      |
| 1–2 issues moved; below the project's normal pace                    | warn    |
| Zero issues moved or completed                                       | bad     |

Why this matters even when other dimensions are fine: a project where no work happens for a week — even one with weekly status updates and a present lead — usually means the lead is working on something else, or real work is happening in PRs/Notion/Slack that isn't reflected in Linear. Both are worth surfacing.

Calibrate to the project's normal cadence (read recent history): a research project might genuinely move slowly and that's fine; a delivery project with no movement in a week is a `bad` even if the target date is months away.

### Blockers

Read the latest 2–3 status updates and the most recent project-level comments for any of:

- External upstream dependencies (e.g., "waiting on upstream Bun PR", "blocked on platform team")
- Unresolved technical decisions ("we still need to pick X over Y")
- People-blockers ("need review from N", "waiting on access")

If you find any, surface them as their own item in **Top concerns** — labeled "Blocker: ..." — and include a one-line description of what's blocking and what would unblock it. Blockers are different from staleness: a project can be perfectly healthy in cadence and still be blocked. Naming them explicitly is often the single most useful thing the report does.

If status updates and comments don't mention any blockers, simply omit the blocker line — don't fabricate one.

## Computing the overall verdict

Roll the per-dimension verdicts into one of:

- **🟢 Green — On track.** All ok, or at most one `warn` that's clearly minor.
- **🟡 Yellow — Needs attention.** Multiple `warn`s, or one `bad` that has a clear path to resolution.
- **🔴 Red — At risk.** Two or more `bad`s, or a single `bad` that meaningfully threatens the target date (e.g., target imminent + stale issues).

Don't double-count: a missing target date inflates a few dimensions; weigh holistically.

## Output

Produce a single markdown report in the chat, using the structure below. Keep prose tight — managers skim.

```markdown
# Project status: <Project Name>

**Verdict:** <emoji + Green/Yellow/Red> — <one-line summary>

**Project:** [<name>](url) · **Lead:** <name or "—"> · **Target:** <date or "—"> · **Issues:** <open>/<total> open

## Top concerns

<ranked bullets, most important first. Each bullet states the problem and what to do about it. Limit to ~5.>

- **<short headline>:** <1–2 sentence description, with concrete numbers where possible. Recommendation if not obvious.>

## Dimension breakdown

| Dimension        | Verdict  | Notes                                                 |
| ---------------- | -------- | ----------------------------------------------------- |
| Status updates   | 🟢/🟡/🔴 | <e.g., "Last update 3 days ago by @alice">            |
| Lead             | 🟢/🟡/🔴 | <e.g., "@alice"; binary — set or not>                 |
| Lead engagement  | 🟢/🟡    | <e.g., "Assigned to 7/8 issues"; omit row if no lead> |
| Target date      | 🟢/🟡/🔴 | <e.g., "2026-06-30, 33 days away — looks tight">      |
| Target stability | 🟢/🟡/🔴 | <e.g., "Pushed twice in last 6 weeks per updates">    |
| Issue staleness  | 🟢/🟡/🔴 | <e.g., "4 in-progress issues untouched > 14 days">    |
| Recent activity  | 🟢/🟡/🔴 | <e.g., "3 issues moved in last 7d">                   |
| Milestones       | 🟢/🟡/🔴 | <e.g., "Milestone 'Alpha' past due, 3 issues open">   |
| Scope stability  | 🟢/🟡/🔴 | <e.g., "12 new issues in last 30d, target in 20d">    |

## Recommended next steps

<3–5 concrete actions for the project lead. Each should be doable this week.>

1. ...
2. ...

---

_Data as of <ISO date>. Run weekly to track trend._
```

Notes on the report:

- **Lead with the verdict.** That single line is the part a manager actually reads.
- **Top concerns are the value.** A green project gets a short report. A red one gets the bullets that matter, not all seven dimensions in detail.
- **Numbers beat adjectives.** "4 issues stale > 14d" beats "several stale issues". Always cite specifics.
- **Don't pad.** If a dimension is fine, the row in the table is enough; don't write a paragraph for every ok.
- **Don't quote issue titles unless they illustrate the point.** A list of titles isn't insight.
- **Time anchoring:** all "X days ago" should be relative to today (use the system date). If the data feed is older than your run time, prefer the data's date and say so.

## Common failure modes to avoid

- **Treating Linear's defaults as health signals.** A project that has no milestones is not automatically broken; it's a `warn` only if the project is large enough to warrant them. Calibrate to the project size.
- **Confusing a slow-moving project with a stuck one.** Some projects have low velocity by design (e.g., research, long-running compliance). If the status updates clearly explain low velocity, downgrade staleness flags accordingly.
- **Citing issue counts without context.** "10 open issues" is meaningless without total / target-date / age. Pair every count with a denominator or a date.
- **Refusing to give a verdict.** The user wants a Green/Yellow/Red call. Even if you're uncertain, pick one and explain the uncertainty in the verdict line. Don't punt.
- **Hallucinating data Linear didn't return.** If the data is missing, say "could not determine from available data" rather than inventing.
