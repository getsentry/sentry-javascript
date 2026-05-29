---
name: linear-project-update
description: Help the user draft and (with their explicit approval) post a status update to a Linear project they lead. Use whenever the user wants to "post a project update", "write a status update", "update my Linear project", "send a project update", or asks for help with weekly/biweekly project updates. Also trigger when the user pastes a Linear project URL and asks for an update, mentions wanting to write an update for their project, or wants help drafting a status message for stakeholders. Even when the user doesn't explicitly say "post" or "status update" — if the underlying request is "help me write an update for my Linear project", trigger this skill. The user always keeps final control of the words; this skill drafts a proposal and never posts without explicit confirmation in the same turn.
argument-hint: [linear-project-url-or-id-or-slug]
---

# Linear Project Update

You are helping the user draft a status update for a Linear project they lead. The end-state is either (a) a posted update plus an optional target-date change, applied only with the user's explicit go-ahead in this turn, or (b) a draft the user takes and posts themselves.

The user owns the words that go out under their name. Your job is to give them a strong starting point and clear options, then get out of the way. **Never post or change anything without explicit confirmation in this turn.**

## Workflow

### Step 1 — Resolve the project

If the user provided a project (URL, slug, or UUID), pass whatever they gave you straight to `mcp__claude_ai_Linear__get_project` as `query` and extract the `id` (UUID) from the response. Linear's MCP accepts all three forms — don't try to parse URLs yourself.

If they did not provide one, help them pick:

1. Identify the current user. Try `mcp__claude_ai_Linear__list_users` with `query: "me"` first; if that doesn't return the authenticated user, fall back to whatever mechanism Linear's MCP exposes for the current user.
2. Fetch the user's projects via `mcp__claude_ai_Linear__list_projects`, filtered to ones they lead. If the MCP doesn't accept a direct `lead` filter, list projects and filter client-side by `lead.id == <current-user-id>`.
3. For each project, you need: name, status, target date, and the timestamp of the last status update. The last-update timestamp may not come back in the project payload — if not, call `mcp__claude_ai_Linear__get_status_updates` with `type: "project", project: <uuid>, limit: 1, orderBy: "createdAt"` per project. Do these in parallel.
4. Sort the projects:
   - **In Progress / Started** first (the user is most likely to be updating one of these).
   - Then other active statuses (Planned, Paused, Backlog).
   - Completed / Canceled last — usually omit unless the user has nothing active.
5. Present the list with `AskUserQuestion`. Format each option so the user can see at a glance which projects need attention:

   `<Project name> — target: <YYYY-MM-DD or "—"> · last update: <X days ago or "never">`

   Put the project most likely to need an update first (e.g., longest since last update among In Progress projects).

6. Once picked, continue with that project's UUID.

If `get_project` errors or the user has no led projects, stop and tell them — don't fabricate.

### Step 2 — Audit project status

Invoke the **`linear-project-status`** skill on the resolved project UUID. That skill produces the health verdict, top concerns, dimension breakdown, recent activity, and blocker analysis you'll need to write a useful update.

Keep the audit output handy — you'll cite specifics in the proposal (e.g., "3 issues stale > 14 days", "target date in 12 days with 8 issues still open", "no movement on issues in the last 7 days"). Generic updates are useless; concrete ones build trust.

### Step 3 — Gather additional context

The audit tells you what Linear knows. The user knows what Linear doesn't. Ask once, broadly, rather than peppering them with separate questions:

> "Anything I should know that isn't in Linear before I draft this? PTO or absences (yours or the team's), blockers, competing priorities, or general context you want stakeholders to hear. Or just say 'no extra context' to skip."

Wait for their reply. Treat empty / "skip" as a valid answer.

### Step 4 — Draft the proposal

Synthesize the audit + the user's context into two things: a target-date recommendation and an update body.

#### Target date recommendation

Recommend whatever the audit and the user's context actually support — but be cautious about small moves. A few-day push tends to signal indecision and erodes trust in the date.

- **Realistic** (audit and remaining scope support it): recommend **no change**, even if the date feels a little uncomfortable. Say so explicitly: "Target stays at <date>."
- **Unrealistic** (audit flagged target as `warn`/`bad`, or the date is already in the past): recommend a new date with real headroom given the open scope. Default to moving it out by at least a week — but if a shorter move genuinely fits the situation (e.g., a launch tied to a known external date a few days out, or the user's context makes a sub-week shift obviously right), recommend that and explain why.
- **If you propose a sub-week move** (or the user later asks for one): flag it explicitly so they can reconsider. Something like: "This is only N days out from the current target — small moves often look like indecision. Want to either hold the date or push to <date-≥-1-week-out> instead?" Then defer to the user's call.

When recommending any new date, justify it in one line tied to audit specifics: "8 of 15 issues still open with 5 days to target — propose pushing to <date>."

#### Update body

A good status update is:

- **Short.** A few paragraphs at most. Stakeholders skim.
- **Concrete.** "Shipped X and Y; in flight on Z; blocked on W" beats "made progress on several fronts".
- **Honest about risks.** If the audit flagged a blocker or staleness, name it; don't paper over.
- **Forward-looking.** What's the next deliverable and by when.

Cover, in roughly this order:

1. **Since the last update** — what shipped, what moved. Pull from the audit's recent-activity data and from the user-supplied context.
2. **What's next** — the immediate next milestone or deliverable.
3. **Risks / blockers** — name them. Use any blocker context the user provided.
4. **Target date** — only mention if you're proposing a change, or if explicit reaffirmation is useful.

**Match the user's voice.** Read the last 2–3 status updates on this project before drafting. If the user writes in conversational paragraphs, don't return a bulleted formal report. If they use bullets and headers, match that. Mismatched tone is the fastest way to make the user feel the draft isn't theirs.

### Step 5 — Present and get the user's call

Show both proposals together in the chat:

```
**Proposed target date:** <new date or "no change"> — <one-line reason>

**Proposed update:**

<draft body>
```

Then use `AskUserQuestion` to offer three choices:

1. **Submit as-is** — post the update and apply the target-date change (if any).
2. **Adjust first** — iterate on the draft with feedback, re-present, then ask again.
3. **Stop here** — user takes the draft and handles it themselves.

If they pick "Adjust first", treat it as collaborative editing, not a from-scratch rewrite. Preserve what they liked. Loop back through Step 5 after each revision.

### Step 6 — Apply changes (only on explicit go-ahead)

Only if the user explicitly approved in Step 5:

1. If a target-date change was approved, call `mcp__claude_ai_Linear__save_project` with the new `targetDate`.
2. Call `mcp__claude_ai_Linear__save_status_update` with the project ID and final body. Set `health` from the audit verdict (Green → `onTrack`, Yellow → `atRisk`, Red → `offTrack`); if Linear's MCP rejects those enum values, check the schema and pick the closest valid one rather than guessing repeatedly.
3. Confirm both succeeded and link the user to the project's overview.

If any call fails, surface the exact error and stop. Do not retry silently or fudge the user's understanding of what's actually in Linear.

## What to never do

- Post a status update or change a target date without the user's explicit "go" in this turn. A choice from earlier in the conversation does not count if the draft has since changed.
- Move a target date by a few days "just to be safe" without flagging it. Small moves erode trust in the date; if you (or the user) propose one, explicitly surface it so they're making the call with eyes open.
- Fabricate context — blockers, accomplishments, PTO, dates. If you don't know it, ask or omit it. Stakeholders will read this; wrong details damage the user's credibility.
- Override the user's voice. Suggest a wording change once; if they push back, drop it.
- Aim for comprehensive. A short, honest update beats a long one that buries the lede.
