# Triage Issue Security Scripts

Security scripts for the automated triage-issue workflow.

## detect_prompt_injection.py

Checks GitHub issues for two things before triage proceeds:

1. **Language** — rejects non-English issues (non-ASCII/non-Latin scripts, accented European characters)
2. **Prompt injection** — regex pattern matching with a confidence score; rejects if score ≥ 8

Exit codes: `0` = safe, `1` = rejected, `2` = input error (treat as rejection).

## parse_gh_issues.py

Parses `gh api` JSON output (single issue or search results) into a readable summary. Used in CI instead of inline Python.

## post_linear_comment.py

Posts the triage report to an existing Linear issue. Reads `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` from environment variables — never pass secrets as CLI arguments.
