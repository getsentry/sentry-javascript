---
name: linear-project-status
description: Analyze a Linear project's health and produce a status summary for a project lead or manager. Inspects status-update cadence, lead/owner presence, target-date realism and stability, issue staleness, milestone health, and scope creep. Use whenever the user wants a status report, project review, health check, weekly review, or audit of a Linear project — including phrases like "how is project X going", "give me a status on this Linear project", "audit this project", "is this project on track", "check project health", or when they paste a Linear project URL and ask for a summary. Use it even when the user doesn't explicitly say "audit" or "status" — if the request is fundamentally "tell me how this Linear project is doing", trigger this skill.
argument-hint: <linear-project-url-or-id-or-slug>
---

# Linear Project Status Audit

You are producing a project-health audit for a Linear project. The skill is designed to be run roughly weekly.

## Audience and intent

The audience is the **project lead reviewing a project they own** — not a manager reviewing a person, and not someone else evaluating the team. Frame everything accordingly.

What this audit is:

- A **process review of the project**: are the signals in Linear (target date, updates, milestones, scope) set up so the project can succeed and so stakeholders know where it stands?
- A list of **pointers the lead can act on this week** to improve those signals.

What this audit is **not**:

- A judgment of any individual's performance or workload.
- A claim that a green/yellow/red verdict reflects how well anyone is doing their job. Projects go yellow or red for legitimate reasons outside anyone's control (descopes, dependency slips, reprioritization, PTO, parallel work absorbing the team). That's fine — the verdict is a signal, not a grade.

There is context the audit cannot see: PTO and absences, deprioritization in favor of higher-stakes work, decisions made in Slack/Notion/meetings that haven't been written into Linear, work happening in PRs that isn't yet linked to issues. When a dimension flags as `warn` or `bad`, the lead is the one who knows whether there's a benign explanation. The audit's job is to **surface the signal so they can decide**, not to assign blame.

When you write recommendations, target **the project's process** ("add a target date", "split the milestone", "narrow scope before the ship date") — not the people ("X needs to update more often", "Y should be doing more"). If the data implies a people-shaped concern, name the project-shaped fix: "no updates in 3 weeks → consider setting a recurring weekly update reminder," not "the lead hasn't been updating."

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

The verdict has two parts: **what's the most recent gap**, and **is the cadence currently healthy** (looking at the last few weeks, not the distant past). What matters is the trajectory — if the recent rhythm is good, the lead is doing the right thing and we should reinforce that, not dwell on history.

**Step 1 — most recent gap (days since last update):**

| Days since last update | Verdict baseline |
| ---------------------- | ---------------- |
| ≤ 8 days               | ok               |
| 9–14 days              | warn             |
| > 14 days, or none     | bad              |

**Step 2 — adjust for trajectory by looking at the last ~4 updates (or however many exist in the recent ~6 weeks):**

- If the most recent update is fresh (≤ 8 days) but there's a long silence (>21 days) immediately before it in the recent window → downgrade to **`warn`**. Frame the note as a positive: the recent update is good, before that the cadence had slipped — recommend keeping up the weekly rhythm so it sticks. Don't make this a critique; the lead has already corrected course.
- If the last few weeks (~4 updates / ~6 weeks) are in a reasonable rhythm — say, mostly weekly with the occasional 10–12 day gap — keep the verdict **`ok`** even if there was a long gap further back in the project's history. A multi-month dormant period followed by 6 weeks of steady updates is a project that's _in good shape now_; don't penalize it for ancient history.
- If the last few weeks show repeated gaps (multiple >14d stretches), the project hasn't actually recovered — keep it at `warn` or escalate to `bad` depending on the pattern.

Examples of how to read this:

- Latest update 2 days ago, but the one before was 51 days earlier, and only 2 updates in the last 6 weeks → **warn**, with a note like "Updated 2 days ago — good. There was a 51-day gap before that; recommend keeping the weekly rhythm going."
- Latest update 3 days ago, with 4 prior updates spaced 7–10 days apart, but a 60-day silence further back → **ok**, no special note needed. The recent rhythm is healthy.
- Latest update 4 days ago, but with three >14-day gaps in the last 6 weeks → **warn**, the cadence isn't stable yet.

Don't flag single-author updates. Projects are typically owned by one person and it's fine — even expected — for that person to write all updates. The cadence is what matters, not the authorship distribution.

### 2. Project lead

This dimension is binary — either there's a lead set on the project or there isn't:

| Condition                    | Verdict |
| ---------------------------- | ------- |
| `lead` is set on the project | ok      |
| No lead set                  | bad     |

Every project should have a designated lead so stakeholders know who to ask. Don't try to infer a "de facto lead" from update authorship — the field is either set or it isn't. A missing lead is a common process gap; flag it.

### 2b. Lead engagement

Separately from "is there a lead set", check whether the lead appears to be **finding time to engage with the project**. The point of this dimension is to surface, for the lead's own awareness, whether their attention on this project is showing up in Linear — not to grade their output.

A lead can be engaged in two legitimate shapes, and either is fine:

- **Implementer:** assigned to a meaningful share of the project's issues and moving them.
- **Orchestrator:** not assigned to many issues themselves, but visibly driving the project — writing the status updates, posting project comments, managing milestones, triaging incoming issues, unblocking contributors. The work shows up as project-level signal rather than issue assignments.

Look at both shapes together before judging. A lead with zero assigned issues who writes weekly updates and comments on blockers is engaged; flag only if **neither** shape of engagement is present.

| Condition                                                                                         | Verdict |
| ------------------------------------------------------------------------------------------------- | ------- |
| Lead shows up as implementer (assigned issues moving) **or** orchestrator (updates/comments/etc.) | ok      |
| Lead is largely absent from both issue work **and** project-level activity in the last few weeks  | warn    |
| No lead is set (covered by dimension 2; skip this dimension)                                      | n/a     |

A `warn` here is **not** a critique of the lead. It usually means the lead hasn't had time for this project lately — PTO, a competing priority, or coordination happening in Slack/meetings that hasn't been written into Linear. The lead is the one who knows which. The point of surfacing it is so they can decide whether to reclaim time, hand off, or just note that this is a temporary lull.

### 3. Target date — presence and realism

First, check presence — a target date is required on every project:

- No target date → `bad`. An end-state without a date is a backlog, not a project. Always flag this as a top concern.
- Target date set → judge realism (below).

To judge realism, compare days remaining to the open scope. Rough heuristic:

- `bad` if target date is within 14 days AND (there are open issues with no recent activity, OR open issues outnumber completed ones). Both sub-conditions are scoped to the 14-day window — a young project with mostly-open issues isn't `bad`, only one about to ship that isn't ready.
- `warn` if target date is within 30 days AND >40% of issues are still open.
- `ok` otherwise.

**Special case — target date is today or in the past, project not Completed:** This is a specific and common situation worth flagging explicitly rather than burying in the rules above:

- `bad` if the target date has been past for more than ~7 days and the project status is still not `completed` / `canceled`. Either the project is silently slipping or the date is no longer a real commitment — both need a decision.
- `warn` if the target date is today or up to a week past, and the latest status update doesn't say the release is shipping imminently. ("Today is the target — are we shipping today, or do we need a new date?")
- If the latest update clearly says "shipping this week / shipping today" and the data backs it (open issues all small or near-done), keep this dimension `ok` but call out the imminence in **Top concerns** so the lead doesn't accidentally let the date drift again.

These are anchors, not rules — if status updates say "we're descoping X" or "ship date moved deliberately", weight that.

### 4. Target date stability

A project's target date should change rarely. Each push-out has a cost — stakeholders calibrate to dates, and frequent slippage erodes that signal.

You typically can't query the target-date history directly. Read the status updates and the project description for explicit mentions of date changes (Linear sometimes includes a `diffMarkdown` field on status updates that shows the prior date — use it). Count distinct dates that have been referenced as "the target".

The verdict depends on both **how many** pushes and **how well-documented** they are. A push that's transparently explained in a status update ("descoping X to ship Y on time", "blocked on upstream Z, moving to next sprint", "lead out sick, extending one week") is materially different from a push with no recorded reason or a vague one ("needs more time", or no update at all near the push).

| Pushes mentioned in recent updates | All pushes well-explained?              | Verdict |
| ---------------------------------- | --------------------------------------- | ------- |
| 0–1                                | n/a                                     | ok      |
| 2                                  | Yes (clear reason in updates)           | ok      |
| 2                                  | No / vague                              | warn    |
| 3+                                 | Yes (every push has a real explanation) | warn    |
| 3+                                 | No / mixed / mostly vague               | bad     |

"Well-explained" means the update names a specific cause the reader can evaluate — illness, dependency slip, scope change, reprioritization, external blocker. "Need more time" or silence around the push date doesn't count. When in doubt, downgrade rather than upgrade — three pushes is three pushes, and even well-documented ones add up.

If you can't tell at all, say so — don't guess. State: "Could not determine target-date history from available data."

### 5. Issue staleness

For each open issue (states: backlog, unstarted, started), compute days since `updatedAt`.

- `bad`: an issue is `started` (In Progress) but hasn't been touched in > 14 days. In-progress work should be finishing, not sitting.
- `warn`: > 30% of open issues haven't been touched in > 21 days.
- `ok`: most open issues moved within the last few weeks.

Backlog-state issues that are stale are less alarming than started-state ones — call them out separately if it matters.

### 6. Milestone health

For each milestone, check the target date, the milestone's progress field, and the state of its associated issues. (You may need to look at each issue's milestone via the issue payload; otherwise infer from titles/labels.)

- `bad`: milestone target date in the past AND the work clearly hasn't shipped (open issues remain in scope, status updates don't mention delivery).
- `warn`: milestone target date in the past AND it's unclear whether the work shipped; OR milestone has no issues attached at all (it's just a date on a calendar).
- **`warn` (tracking-hygiene gap):** milestone target date in the past, progress is still 0% / not marked complete, BUT the work clearly did ship — the milestone description says "DONE", linked issues are completed, or status updates describe the milestone's outcome as delivered. Treat this as a distinct case from "unclear whether shipped" and say so explicitly in the notes, because the project-shaped fix is different: just update the milestone state to reflect reality. This is benign as a delivery signal but misleads anyone reading the project at a glance.
- `ok`: milestones are in the future, or past ones are clearly marked done.

A project with no milestones isn't automatically a problem on small projects — but on multi-month projects, the absence of milestones is itself a `warn`.

When you surface a tracking-hygiene gap in **Top concerns**, frame the recommendation as a quick cleanup ("mark milestone X complete — its description and linked PRs already show it shipped") rather than a delivery concern.

### 7. Scope stability (issue additions)

Compare issues added in the last 30 days against total open issues, and look at whether new issues are still being added late in the project's life.

- `bad`: target date is < 30 days away AND new issues are still being added at a non-trivial rate.
- `warn`: > 30% of currently-open issues were created in the last 30 days on a project that's been going for months.
- `ok`: rate of new issues is decreasing, or matches expected discovery on a young project.

The point of this check: a project should converge toward a defined end state. A project where issues keep getting added is really a workstream, not a project.

**Always distinguish planned decomposition from scope drift — decomposition is healthy and should never be flagged.** When new issues share a common `parentId` (or are otherwise clearly the structural breakdown of a previously-larger ticket), that's not scope growing — it's the same scope being made legible. A lead taking a vague "build server-utils" ticket and exploding it into 6 concrete sub-issues is doing exactly the right thing.

Before flagging, group the new issues by `parentId`:

- If most of the new issues in the last 30 days share one or a few `parentId`s — i.e., they're children of an existing in-scope issue — treat that batch as a single planned breakdown. Do not let it push the verdict toward `warn` or `bad`. Note it positively in the dimension's notes ("12 new issues, but all sub-issues of JS-1234 — planned decomposition, healthy").
- If the new issues are scattered with no shared parent (or are themselves top-level), that's the actual signal scope stability is designed to catch — keep the standard thresholds.

When in doubt, look at the status updates: if the lead's update describes the new tickets as planning/breakdown work, that's confirmation. Genuine drift looks like ad-hoc "oh and also..." tickets without a structural reason; decomposition looks like a coherent set added together.

### 8. Recent activity (last 7 days)

Per-issue staleness (dimension 5) tells you whether individual tickets are sitting. This dimension is the project-level pulse: did _anything_ happen this week?

Count issues that were either **completed** or **updated while in a `started` state** in the last 7 days. (Use the `list_issues` `updatedAt: -P7D` filter, or filter the issues you already fetched.)

| Activity in last 7 days                                              | Verdict |
| -------------------------------------------------------------------- | ------- |
| Several issues moved or completed; matches the project's normal pace | ok      |
| 1–2 issues moved; below the project's normal pace                    | warn    |
| Zero issues moved or completed                                       | bad     |

Why this matters even when other dimensions are fine: a project where Linear shows no movement for a week is either genuinely paused (PTO, competing priorities, deliberate hold — the lead will know) or work is happening in PRs/Notion/Slack that isn't reflected back into Linear. Both are worth surfacing so the lead can decide whether to act. Do not speculate about why activity is low — just surface it.

Calibrate to the project's normal cadence (read recent history): a research project might genuinely move slowly and that's fine; a delivery project with no movement in a week is worth flagging as `bad` even if the target date is months away.

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

The verdict is a **signal for the lead to interpret, not a grade**. Yellow or red can be the right state for a project (a project waiting on an upstream dependency, or one that's been deliberately paused, may legitimately read as yellow/red). The point of the audit is to make the situation legible and offer pointers to improve the project's process — not to imply anyone is doing poorly.

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

| Dimension        | Verdict  | Notes                                                            |
| ---------------- | -------- | ---------------------------------------------------------------- |
| Status updates   | 🟢/🟡/🔴 | <e.g., "Last update 3 days ago">                                 |
| Lead             | 🟢/🟡/🔴 | <e.g., "@alice"; binary — set or not>                            |
| Lead engagement  | 🟢/🟡    | <e.g., "Drives project via updates + comments"; omit if no lead> |
| Target date      | 🟢/🟡/🔴 | <e.g., "2026-06-30, 33 days away — looks tight">                 |
| Target stability | 🟢/🟡/🔴 | <e.g., "Pushed twice in last 6 weeks per updates">               |
| Issue staleness  | 🟢/🟡/🔴 | <e.g., "4 in-progress issues untouched > 14 days">               |
| Recent activity  | 🟢/🟡/🔴 | <e.g., "3 issues moved in last 7d">                              |
| Milestones       | 🟢/🟡/🔴 | <e.g., "Milestone 'Alpha' past due, 3 issues open">              |
| Scope stability  | 🟢/🟡/🔴 | <e.g., "12 new issues in last 30d, target in 20d">               |

## Recommended next steps

<3–5 concrete actions targeting the project's process — things the lead could do this week to improve the signals in Linear. Frame as project-shaped fixes, not people-shaped critiques.>

1. ...
2. ...

---

_Data as of <ISO date>. The audit can't see PTO, competing priorities, or work happening outside Linear — weigh accordingly. Run weekly to track trend._
```

Notes on the report:

- **Lead with the verdict.** That single line is the part a manager actually reads.
- **Top concerns are the value.** A green project gets a short report. A red one gets the bullets that matter, not all seven dimensions in detail.
- **Numbers beat adjectives.** "4 issues stale > 14d" beats "several stale issues". Always cite specifics.
- **Don't pad.** If a dimension is fine, the row in the table is enough; don't write a paragraph for every ok.
- **Don't quote issue titles unless they illustrate the point.** A list of titles isn't insight.
- **Time anchoring:** all "X days ago" should be relative to today (use the system date). If the data feed is older than your run time, prefer the data's date and say so.

## Common failure modes to avoid

- **Reviewing people instead of the project.** This is the most important one. The audit is about the project's signals and process, not the lead's or team's individual performance. Frame findings as project-shaped fixes ("add a target date", "tighten scope before ship"), not people-shaped critiques ("the lead needs to update more"). When a dimension flags, assume there's a benign reason the data can't see (PTO, competing priorities, work happening outside Linear) and let the user decide how to weight it.
- **Treating Linear's defaults as health signals.** A project that has no milestones is not automatically broken; it's a `warn` only if the project is large enough to warrant them. Calibrate to the project size.
- **Confusing a slow-moving project with a stuck one.** Some projects have low velocity by design (e.g., research, long-running compliance). If the status updates clearly explain low velocity, downgrade staleness flags accordingly.
- **Citing issue counts without context.** "10 open issues" is meaningless without total / target-date / age. Pair every count with a denominator or a date.
- **Refusing to give a verdict.** The user wants a Green/Yellow/Red call. Even if you're uncertain, pick one and explain the uncertainty in the verdict line. Don't punt. (Remember the verdict is a signal, not a grade — it's fine for a project to be yellow or red for legitimate reasons.)
- **Hallucinating data Linear didn't return.** If the data is missing, say "could not determine from available data" rather than inventing.
