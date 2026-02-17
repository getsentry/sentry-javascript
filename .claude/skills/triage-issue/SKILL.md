---
name: triage-issue
description: Triage GitHub issues with codebase research and actionable recommendations
argument-hint: <issue-number-or-url> [--ci]
---

# Triage Issue Skill

You are triaging a GitHub issue for the `getsentry/sentry-javascript` repository.

## Input

The user provides: `<issue-number-or-url> [--ci]`

- **Required:** An issue number (e.g. `1234`) or a full GitHub URL (e.g. `https://github.com/getsentry/sentry-javascript/issues/1234`)
- **Optional:** `--ci` flag — when set, format output as a Linear payload stub instead of a terminal report

Parse the issue number from the input. If a URL is given, extract the number from the path.

## Workflow

Follow these steps in order. Use tool calls in parallel wherever steps are independent.

### Step 1: Fetch Issue Details

- Run `gh api repos/getsentry/sentry-javascript/issues/<number>` to get the title, body, labels, reactions, and state.
- Run `gh api repos/getsentry/sentry-javascript/issues/<number>/comments` to get the conversation context.

### Step 2: Classify the Issue

Based on the issue title, body, labels, and comments, determine:

- **Category:** one of `bug`, `feature request`, `documentation`, `support`, `duplicate`
- **Affected package(s):** Identify which `@sentry/*` packages are involved. Look at:
  - Labels (e.g. `Package: browser`, `Package: node`)
  - Stack traces in the body
  - Code snippets or import statements mentioned
  - SDK names mentioned in the text
- **Priority:** `high`, `medium`, or `low` based on:
  - Number of reactions / thumbs-up (>10 = high signal)
  - Whether it's a regression or data loss issue (high)
  - Crash/error frequency signals (high)
  - Feature requests with few reactions (low)
  - General questions or support requests (low)

### Step 3: Codebase Research

Search for relevant code in the local sentry-javascript repository:

- Use Grep/Glob to find error messages, function names, and code paths mentioned in the issue.
- Look at stack traces and find the corresponding source files.
- Identify the specific code that is likely involved.

Then search cross-repo for related context:

- Search `getsentry/sentry-javascript-bundler-plugins` via: `gh api search/code -X GET -f "q=<search-term>+repo:getsentry/sentry-javascript-bundler-plugins"`
- Search `getsentry/sentry-docs` via: `gh api search/code -X GET -f "q=<search-term>+repo:getsentry/sentry-docs"`

Pick 1-3 targeted search terms from the issue (error messages, function names, config option names). Do NOT search for generic terms.

### Step 4: Related Issues & PRs

- Search for duplicate or related issues: `gh api search/issues -X GET -f "q=<search-terms>+repo:getsentry/sentry-javascript+type:issue"`
- Search for existing fix attempts: `gh pr list --repo getsentry/sentry-javascript --search "<search-terms>" --state all --limit 5`

### Step 5: Root Cause Analysis

Based on all gathered information:

- Identify the likely root cause with specific code pointers (`file:line` format)
- Assess **complexity**: `trivial` (config/typo fix), `moderate` (logic change in 1-2 files), or `complex` (architectural change, multiple packages)
- If you cannot determine a root cause, say so clearly and explain what additional information would be needed.

### Step 6: Generate Triage Report

Output the following structured report:

```
## Issue Triage: #<number>

**Title:** <title>
**Classification:** <bug|feature request|documentation|support|duplicate>
**Affected Package(s):** @sentry/<package>, ...
**Priority:** <high|medium|low>
**Complexity:** <trivial|moderate|complex>

### Summary
<1-2 sentence summary of the issue>

### Root Cause Analysis
<Detailed explanation with file:line code pointers. Reference specific functions, variables, and logic paths.>

### Related Issues & PRs
- #<number> - <title> (<open|closed|merged>)
- (or "No related issues found")

### Cross-Repo Findings
- **bundler-plugins:** <findings or "no matches">
- **sentry-docs:** <findings or "no matches">

### Recommended Next Steps
1. <specific action item>
2. <specific action item>
3. ...
```

### Step 7: Suggested Fix Prompt

If a viable fix is identified (complexity is trivial or moderate, and you can point to specific code changes), include a copyable prompt block:

```
### Suggested Fix

Complexity: <trivial|moderate|complex>

To apply this fix, run the following prompt in Claude Code:

\`\`\`
Fix GitHub issue #<number> (<title>).

Root cause: <brief explanation>

Changes needed:
- In `packages/<pkg>/src/<file>.ts`: <what to change>
- In `packages/<pkg>/test/<file>.test.ts`: <test updates if needed>

After making changes, run:
1. yarn build:dev
2. yarn lint
3. yarn test (in the affected package directory)
\`\`\`
```

If the issue is complex or the fix is unclear, skip this section and instead note in the Recommended Next Steps what investigation is still needed.

### Step 8: Output Based on Mode

- **Default (no `--ci` flag):** Print the full triage report directly to the terminal. Do NOT post anywhere, do NOT create PRs, do NOT comment on the issue.
- **`--ci` flag:** Format the triage report as a Linear payload stub and print it. Include a `TODO` note that this will be connected to Linear via MCP/API integration in the future. The stub should look like:

```json
{
  "TODO": "Connect to Linear API or MCP tool to post this payload",
  "teamId": "JAVASCRIPT_SDK_TEAM_ID",
  "title": "Triage: #<number> - <title>",
  "description": "<full triage report in markdown>",
  "priority": <1-4>,
  "labels": ["triage", "<category>"]
}
```

## Important Rules

- Do NOT modify any files in the repository.
- Do NOT create branches, commits, or PRs.
- Do NOT comment on the GitHub issue.
- Do NOT post to any external services (unless `--ci` is specified, and even then only print the payload).
- Focus on accuracy: if you're uncertain about the root cause, say so rather than guessing.
- Keep the report concise but thorough. Developers should be able to act on it immediately.
