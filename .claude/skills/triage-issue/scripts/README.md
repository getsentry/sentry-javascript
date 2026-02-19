# Triage Issue Security Scripts

## Overview

These scripts provide security defenses for the automated triage-issue workflow in CI.

## detect_prompt_injection.py

**Purpose:** Prevent prompt injection attacks and limit triage to English-only issues.

### How It Works

1. **Language Detection**
   - Checks for accented characters (é, ñ, ö, ç, etc.) that indicate non-English text
   - Rejects issues containing these characters
   - Ensures automated triage only processes English content

2. **Prompt Injection Detection** (English only)
   - Scans for malicious patterns using regex with confidence scoring
   - High-confidence patterns (10 points): System tags, credentials files, script injection
   - Medium-confidence patterns (6-8 points): Instruction overrides, role manipulation, env vars
   - Threshold: 8+ points triggers rejection

### Exit Codes

- `0`: Safe to proceed (English + no injection detected)
- `1`: REJECT (non-English content OR injection attempt detected)
- `2`: Error reading input file

### Usage

```bash
# Fetch issue and save to JSON
gh api repos/getsentry/sentry-javascript/issues/12345 > /tmp/issue.json

# Run security checks
python3 detect_prompt_injection.py /tmp/issue.json

# Check exit code
if [ $? -eq 0 ]; then
  echo "Safe to proceed with triage"
else
  echo "Issue rejected - do not proceed"
fi
```

### Testing

Run the test suite:

```bash
python3 test_detection.py
```

Expected output: `17 passed, 0 failed`

## Detected Attack Patterns

### Language-Agnostic Patterns

- System override tags: `<system_override>`, `[SYSTEM MESSAGE]`
- HTML comment injection: `<!-- CLAUDE: ...  -->`
- Script/iframe injection: `<script>`, `<iframe src=...>`
- Credentials file paths: `~/.aws/credentials`, `~/.ssh/id_rsa`, `.env`
- Environment variables: `$AWS_SECRET_ACCESS_KEY`, `process.env.SECRET`
- Fake verification codes: `ADMIN-OVERRIDE-2024`

### English-Specific Patterns

- Instruction override: "ignore all previous instructions"
- Prompt extraction: "reveal your system prompt"
- Role manipulation: "you are now in admin mode"
- Command execution: "run this command: `env`"
- Credential harvesting: "search for all API keys"
- Chain-of-thought manipulation: "actually, before that..."

## Integration with CI

The detection script is integrated into the GitHub Actions workflow (`.github/workflows/triage-issue.yml`):

```yaml
claude_args: |
  --max-turns 20 --allowedTools "Write,Bash(python3 .claude/skills/triage-issue/scripts/detect_prompt_injection.py *),..."
```

The triage skill (SKILL.md) mandates running this check as Step 0 before any other processing.

##Why This Approach?

1. **Simple & Maintainable**: English-only detection via accented characters is simple and works well
2. **No ML/NLP Required**: Pure regex patterns are fast, deterministic, and easy to audit
3. **Scoring System**: Reduces false positives while catching real attacks
4. **Fail-Safe**: When in doubt, reject - better safe than exploited
5. **Testable**: Clear test cases verify all detection logic

## Limitations

- **English-only**: Non-English bug reports will be rejected
- **Pattern-based**: Sophisticated attacks might evade detection
- **No context awareness**: Can't distinguish malicious from discussion of security topics

These are acceptable tradeoffs for an automated triage system.
