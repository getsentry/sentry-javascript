#!/usr/bin/env python3
"""
Detect prompt injection attempts and non-English content in GitHub issues.

This script performs two security checks:
1. Language check: Reject non-English issues
2. Prompt injection check: Detect malicious patterns in English text

Usage:
  detect_prompt_injection.py <issue-json-file> [comments-json-file]

  issue-json-file    - GitHub issue JSON (single object with title/body)
  comments-json-file - Optional GitHub comments JSON (array of comment objects)
                       When provided, all comment bodies are checked for injection.
                       Language check is skipped for comments (issue already passed).

Exit codes:
  0 - Safe to proceed (English + no injection detected)
  1 - REJECT: Non-English content or injection detected
  2 - Error reading input
"""

import json
import re
import sys
from typing import List, Tuple


def is_english(text: str) -> Tuple[bool, float]:
    """
    Check if text is primarily English.

    Strategy:
    1. Reject text where a significant fraction of alphabetic characters are
       non-ASCII (covers Cyrillic, CJK, Arabic, Hebrew, Thai, Hangul, etc.).
    2. Also reject text that contains accented Latin characters common in
       Romance/Germanic languages (é, ñ, ö, ç, etc.).

    Args:
        text: Text to check

    Returns:
        (is_english, ascii_ratio)
    """
    if not text or len(text.strip()) < 20:
        return True, 1.0  # Too short to determine, assume OK

    total_alpha = sum(1 for c in text if c.isalpha())
    if total_alpha == 0:
        return True, 1.0

    ascii_alpha = sum(1 for c in text if c.isascii() and c.isalpha())
    ratio = ascii_alpha / total_alpha

    # If more than 20% of alphabetic characters are non-ASCII, treat as
    # non-English. This catches Cyrillic, CJK, Arabic, Hebrew, Thai,
    # Hangul, Devanagari, and any other non-Latin script.
    if ratio < 0.80:
        return False, ratio

    # For text that is mostly ASCII, also reject known non-Latin script
    # characters that could appear as a small minority (e.g. a single
    # Cyrillic word embedded in otherwise ASCII text).
    NON_LATIN_RANGES = [
        (0x0400, 0x04FF),  # Cyrillic
        (0x0500, 0x052F),  # Cyrillic Supplement
        (0x0600, 0x06FF),  # Arabic
        (0x0590, 0x05FF),  # Hebrew
        (0x0E00, 0x0E7F),  # Thai
        (0x3040, 0x309F),  # Hiragana
        (0x30A0, 0x30FF),  # Katakana
        (0x4E00, 0x9FFF),  # CJK Unified Ideographs
        (0xAC00, 0xD7AF),  # Hangul Syllables
        (0x0900, 0x097F),  # Devanagari
        (0x0980, 0x09FF),  # Bengali
        (0x0A80, 0x0AFF),  # Gujarati
        (0x0C00, 0x0C7F),  # Telugu
        (0x0B80, 0x0BFF),  # Tamil
    ]

    def is_non_latin(c: str) -> bool:
        cp = ord(c)
        return any(start <= cp <= end for start, end in NON_LATIN_RANGES)

    non_latin_count = sum(1 for c in text if is_non_latin(c))
    if non_latin_count > 3:
        return False, ratio

    # Common accented characters in Romance and Germanic languages
    # These rarely appear in English bug reports
    NON_ENGLISH_CHARS = set('áéíóúàèìòùâêîôûäëïöüãõñçßø')
    text_lower = text.lower()
    has_non_english = any(c in NON_ENGLISH_CHARS for c in text_lower)

    if has_non_english:
        return False, ratio

    return True, 1.0


# ============================================================================
# PROMPT INJECTION PATTERNS (English only)
# ============================================================================
# High-confidence patterns that indicate malicious intent

INJECTION_PATTERNS = [
    # System override tags and markers (10 points each)
    (r"<\s*system[_\s-]*(override|message|prompt|instruction)", 10, "System tag injection"),
    (r"\[system[\s_-]*(override|message|prompt)", 10, "System marker injection"),
    (r"<!--\s*(claude|system|admin|override):", 10, "HTML comment injection"),

    # Instruction override attempts (8 points)
    (r"\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)", 8, "Instruction override"),

    # Prompt extraction (8 points)
    (r"\b(show|reveal|display|output|print)\s+(your\s+)?(system\s+)?(prompt|instructions?)", 8, "Prompt extraction attempt"),
    (r"\bwhat\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?)", 8, "Prompt extraction question"),

    # Role manipulation (8 points)
    (r"\byou\s+are\s+now\s+(in\s+)?((an?\s+)?(admin|developer|debug|system|root))", 8, "Role manipulation"),
    (r"\b(admin|developer|system)[\s_-]mode", 8, "Mode manipulation"),

    # Sensitive file paths (10 points) - legitimate issues rarely reference these
    (r"(~/\.aws/|~/\.ssh/|/root/|/etc/passwd|/etc/shadow)", 10, "System credentials path"),
    (r"(\.aws/credentials|id_rsa|\.ssh/id_)", 10, "Credentials file reference"),

    # Environment variable exfiltration (8 points)
    (r"\$(aws_secret|aws_access|github_token|anthropic_api|api_key|secret_key)", 8, "Sensitive env var reference"),
    (r"process\.env\.(secret|token|password|api)", 7, "Process.env access"),

    # Command execution attempts (7 points)
    (r"`\s*(env|printenv|cat\s+[~/]|grep\s+secret)", 7, "Suspicious command in code block"),
    (r"\b(run|execute).{0,10}(command|script|bash)", 6, "Command execution request"),
    (r"running\s+(this|the)\s+command:\s*`", 6, "Command execution with backticks"),

    # Credential harvesting (7 points)
    (r"\bsearch\s+for.{0,10}(api.?keys?|tokens?|secrets?|passwords?)", 7, "Credential search request"),
    (r"\b(read|check|access).{0,30}(credentials|\.env|api.?key)", 6, "Credentials access request"),

    # False authorization (6 points)
    (r"\b(i\s+am|i'm|user\s+is).{0,15}(authorized|approved)", 6, "False authorization claim"),
    (r"(verification|admin|override).?code:?\s*[a-z][a-z0-9]{2,}[-_][a-z0-9]{3,}", 6, "Fake verification code"),

    # Chain-of-thought manipulation (6 points)
    (r"\b(actually|wait),?\s+(before|first|instead)", 6, "Instruction redirect"),
    (r"let\s+me\s+think.{0,20}what\s+you\s+should\s+(really|actually)", 6, "CoT manipulation"),

    # Script/iframe injection (10 points)
    (r"<\s*script[^>]*\s(src|onerror|onload)\s*=", 10, "Script tag injection"),
    (r"<\s*iframe[^>]*src\s*=", 10, "Iframe injection"),
]


def check_injection(text: str, threshold: int = 8) -> Tuple[bool, int, List[str]]:
    """
    Check English text for prompt injection patterns.

    Args:
        text: Text to check (assumed to be English)
        threshold: Minimum score to trigger detection (default: 8)

    Returns:
        (is_injection_detected, total_score, list_of_matches)
    """
    if not text:
        return False, 0, []

    total_score = 0
    matches = []

    normalized = text.lower()

    for pattern, score, description in INJECTION_PATTERNS:
        if re.search(pattern, normalized, re.MULTILINE):
            total_score += score
            matches.append(f"  - {description} (+{score} points)")

    is_injection = total_score >= threshold
    return is_injection, total_score, matches


def analyze_issue(issue_data: dict) -> Tuple[bool, str, List[str]]:
    """
    Analyze issue for both language and prompt injection.

    Returns:
        (should_reject, reason, details)
        - should_reject: True if triage should abort
        - reason: "non-english", "injection", or None
        - details: List of strings describing the detection
    """
    title = issue_data.get("title", "")
    body = issue_data.get("body", "")

    # Combine title and body for checking
    combined_text = f"{title}\n\n{body}"

    # Check 1: Language detection
    is_eng, ratio = is_english(combined_text)

    if not is_eng:
        details = [
            f"Language check failed: non-English characters detected ({ratio:.1%} ASCII alphabetic)",
            "",
            "This triage system only processes English language issues.",
            "Please submit issues in English for automated triage.",
        ]
        return True, "non-english", details

    # Check 2: Prompt injection detection
    is_injection, score, matches = check_injection(combined_text)

    if is_injection:
        details = [
            f"Prompt injection detected (score: {score} points)",
            "",
            "Matched patterns:",
        ] + matches
        return True, "injection", details

    # All checks passed
    return False, None, ["Language: English ✓", "Injection check: Passed ✓"]


def analyze_comments(comments_data: list) -> Tuple[bool, str, List[str]]:
    """
    Check issue comments for prompt injection. Language check is skipped
    because the issue body already passed; comments are checked for injection only.

    Args:
        comments_data: List of GitHub comment objects (each has a "body" field)

    Returns:
        (should_reject, reason, details)
    """
    for i, comment in enumerate(comments_data):
        if not isinstance(comment, dict):
            continue
        body = comment.get("body") or ""
        if not body:
            continue

        is_injection, score, matches = check_injection(body)
        if is_injection:
            author = comment.get("user", {}).get("login", "unknown")
            details = [
                f"Prompt injection detected in comment #{i + 1} by @{author} (score: {score} points)",
                "",
                "Matched patterns:",
            ] + matches
            return True, "injection", details

    return False, None, ["Comments injection check: Passed ✓"]


def main():
    if len(sys.argv) not in (2, 3):
        print("Usage: detect_prompt_injection.py <issue-json-file> [comments-json-file]", file=sys.stderr)
        sys.exit(2)

    json_file = sys.argv[1]

    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            issue_data = json.load(f)
    except Exception as e:
        print(f"Error reading issue JSON file: {e}", file=sys.stderr)
        sys.exit(2)

    should_reject, reason, details = analyze_issue(issue_data)

    if should_reject:
        print("=" * 60)
        if reason == "non-english":
            print("REJECTED: Non-English content detected")
        elif reason == "injection":
            print("REJECTED: Prompt injection attempt detected")
        print("=" * 60)
        print()
        for line in details:
            print(line)
        print()
        sys.exit(1)

    # Check comments if provided
    if len(sys.argv) == 3:
        comments_file = sys.argv[2]
        try:
            with open(comments_file, 'r', encoding='utf-8') as f:
                comments_data = json.load(f)
        except Exception as e:
            print(f"Error reading comments JSON file: {e}", file=sys.stderr)
            sys.exit(2)

        if not isinstance(comments_data, list):
            print("Error: comments JSON must be an array", file=sys.stderr)
            sys.exit(2)

        should_reject, reason, comment_details = analyze_comments(comments_data)
        details.extend(comment_details)

        if should_reject:
            print("=" * 60)
            print("REJECTED: Prompt injection attempt detected")
            print("=" * 60)
            print()
            for line in comment_details:
                print(line)
            print()
            sys.exit(1)

    print("Security checks passed")
    for line in details:
        print(line)
    sys.exit(0)


if __name__ == "__main__":
    main()
