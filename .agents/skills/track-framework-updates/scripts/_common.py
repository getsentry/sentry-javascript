#!/usr/bin/env python3
"""Shared helpers for the track-framework-updates fetcher scripts.

Kept dependency-free (stdlib only) so the skill runs anywhere `python3` and the
GitHub CLI (`gh`) are available, without touching the repo's package.json.
"""

import json
import os
import subprocess
from datetime import datetime, timedelta, timezone

SOURCES_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sources.json")


def load_frameworks(sources_path=SOURCES_PATH):
    """Load the framework list from sources.json."""
    with open(sources_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("frameworks", [])


def cutoff(since_days):
    """Return a timezone-aware datetime `since_days` days ago (UTC)."""
    return datetime.now(timezone.utc) - timedelta(days=since_days)


def parse_iso(value):
    """Parse an ISO-8601 timestamp (GitHub style, e.g. 2024-01-01T00:00:00Z).

    Returns a tz-aware datetime, or None if the value can't be parsed.
    """
    if not value:
        return None
    try:
        # Python's fromisoformat dislikes the trailing "Z" on older versions.
        normalized = value.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def gh_api(path, *, method=None, fields=None, raw_input=None):
    """Call `gh api` and return parsed JSON.

    Raises subprocess.CalledProcessError on failure so callers can fail soft.
    """
    cmd = ["gh", "api", path]
    # gh switches to POST as soon as -f/-F fields are present unless a method is
    # given explicitly. These are all read endpoints, so default to GET.
    if method is None and fields:
        method = "GET"
    if method:
        cmd += ["-X", method]
    for key, val in (fields or {}).items():
        cmd += ["-f", f"{key}={val}"]
    if raw_input is not None:
        cmd += ["--input", "-"]
    result = subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
        input=raw_input,
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def gh_graphql(query, variables=None):
    """Run a GraphQL query through `gh api graphql` and return parsed JSON."""
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, val in (variables or {}).items():
        cmd += ["-F", f"{key}={val}"]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout.strip() else None
