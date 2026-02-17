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
- **Optional:** `--ci` flag — when set, post the triage report as a comment on the existing Linear issue

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

Use the template in `assets/triage-report.md` to generate the structured report. Fill in all `<placeholder>` values with the actual issue details.

### Step 7: Suggested Fix Prompt

If a viable fix is identified (complexity is trivial or moderate, and you can point to specific code changes), use the template in `assets/suggested-fix-prompt.md` to generate a copyable prompt block. Fill in all `<placeholder>` values with the actual issue details.

If the issue is complex or the fix is unclear, skip this section and instead note in the Recommended Next Steps what investigation is still needed.

### Step 8: Output Based on Mode

- **Default (no `--ci` flag):** Print the full triage report directly to the terminal. Do NOT post anywhere, do NOT create PRs, do NOT comment on the issue.
- **`--ci` flag:** Post the triage report as a comment on the existing Linear issue (auto-created by the Linear–GitHub sync bot). Requires these environment variables (provided via GitHub Actions secrets):
  - `LINEAR_CLIENT_ID` — Linear OAuth application client ID
  - `LINEAR_CLIENT_SECRET` — Linear OAuth application client secret

  **SECURITY: Credential handling rules (MANDATORY)**
  - NEVER print, echo, or log the value of `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, any access token, or any secret.
  - NEVER interpolate credentials into a string that gets printed to the conversation.
  - Always pass credentials via environment variable references in Bash commands only.
  - If a curl command fails, print the response body but NEVER print the request headers.

  **Step 8a: Check required env vars**

  Before making any API calls, verify that the required env vars are set:

  ```bash
  [[ -z "$LINEAR_CLIENT_ID" ]] && echo "ERROR: LINEAR_CLIENT_ID is not set" && exit 1
  [[ -z "$LINEAR_CLIENT_SECRET" ]] && echo "ERROR: LINEAR_CLIENT_SECRET is not set" && exit 1
  ```

  If either is missing, print an error and fall back to printing the report to the terminal.

  **Step 8b: Obtain an access token via client credentials flow**

  Reference: https://linear.app/developers/oauth-2-0-authentication#client-credentials-tokens

  ```bash
  TOKEN_RESPONSE=$(curl -s -X POST https://api.linear.app/oauth/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$LINEAR_CLIENT_ID&client_secret=$LINEAR_CLIENT_SECRET&scope=issues:create,read,comments:create")
  LINEAR_ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
  ```

  If the token is empty, print `"Failed to obtain Linear access token"` and the response body (which will not contain secrets), then fall back to printing the report to the terminal.

  The token is valid for 30 days and represents an `app` actor with access to public teams.

  **Step 8c: Find the existing Linear issue**

  The Linear–GitHub sync bot automatically creates a Linear issue when the GitHub issue is opened. Find it by searching for the issue identifier. The issue identifier follows the pattern `JS-XXXX` and can be found in the GitHub issue comments (the bot leaves a comment linking back to Linear).

  First, check the GitHub issue comments (already fetched in Step 1) for a Linear linkback comment. Extract the issue identifier (e.g. `JS-1669`) from the comment body.

  Then fetch the Linear issue by identifier:

  ```bash
  ISSUE_RESPONSE=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $LINEAR_ACCESS_TOKEN" \
    -d '{"query": "{ issue(id: \"JS-XXXX\") { id identifier url title } }"}')
  ```

  Extract the Linear issue UUID from the response. If the issue is not found, fall back to printing the report to the terminal.

  **Step 8d: Check for existing triage comments (idempotency)**

  Before posting, check if a triage comment already exists to avoid duplicates:

  ```bash
  COMMENTS_RESPONSE=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $LINEAR_ACCESS_TOKEN" \
    -d '{"query": "{ issue(id: \"JS-XXXX\") { comments { nodes { body } } } }"}')
  ```

  Check if any comment body starts with `## Automated Triage Report`. If one already exists, print `"Triage comment already exists on <identifier>, skipping"` and exit without posting.

  **Step 8e: Post the triage comment**

  **CRITICAL: Always use Python to build and write the JSON payload to a temp file.** Do NOT use shell heredocs (`<<EOF`), string interpolation, or `cat` to construct JSON — this causes escaping issues with `$`, backticks, and newlines that silently corrupt the payload or produce duplicate requests.

  ```python
  python3 -c '
  import json, os, tempfile

  issue_id = "<LINEAR_ISSUE_UUID>"  # from Step 8c
  comment_body = "<TRIAGE_REPORT_CONTENT>"  # the full triage report text

  payload = {
      "query": "mutation CommentCreate($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body } } }",
      "variables": {
          "input": {
              "issueId": issue_id,
              "body": comment_body
          }
      }
  }

  fd, path = tempfile.mkstemp(suffix=".json")
  with os.fdopen(fd, "w") as f:
      json.dump(payload, f)
  print(path)
  '
  ```

  Then POST the payload file and parse the response:

  ```bash
  RESPONSE=$(curl -s -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $LINEAR_ACCESS_TOKEN" \
    -d @"$PAYLOAD_FILE")
  rm -f "$PAYLOAD_FILE"
  ```

  Parse `$RESPONSE` using Python. Print only:
  - On success: `Triage comment posted on <identifier>: <url>`
  - On failure: `Failed to post triage comment: <error message from response body>`

  If the API call fails, fall back to printing the full report to the terminal.

## Important Rules

- Do NOT modify any files in the repository.
- Do NOT create branches, commits, or PRs.
- Do NOT comment on the GitHub issue.
- Do NOT post to external services unless `--ci` is specified.
- When `--ci` is specified, only post a comment on the existing Linear issue — do NOT create new Linear issues, and do NOT post anywhere else.
- **NEVER print, log, or expose API keys, tokens, or secrets in conversation output.** Only reference them as `$ENV_VAR` in Bash commands.
- Focus on accuracy: if you're uncertain about the root cause, say so rather than guessing.
- Keep the report concise but thorough. Developers should be able to act on it immediately.
