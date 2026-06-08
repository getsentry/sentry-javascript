#!/usr/bin/env python3
"""Shared helpers for the track-framework-updates fetcher scripts.

Kept dependency-free (stdlib only) so the skill runs anywhere `python3` and the
GitHub CLI (`gh`) are available, without touching the repo's package.json.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any

__all__ = [
    "SOURCES_PATH",
    "cutoff",
    "gh_api",
    "gh_graphql",
    "load_frameworks",
    "parse_iso",
]

SOURCES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sources.json"
)


_REPO_PATTERN = re.compile(r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$")


def _validate_framework(fw: dict[str, Any]) -> None:
    """Reject sources.json entries with suspicious values."""
    gh = fw.get("github") or {}
    repo = gh.get("repo")
    if repo and not _REPO_PATTERN.match(repo):
        raise ValueError(f"Invalid github.repo format: {repo!r}")
    rfcs_repo = gh.get("rfcsRepo")
    if rfcs_repo and not _REPO_PATTERN.match(rfcs_repo):
        raise ValueError(f"Invalid github.rfcsRepo format: {rfcs_repo!r}")
    for url in fw.get("rss") or []:
        if not url.startswith("https://"):
            raise ValueError(f"RSS URL must use HTTPS: {url!r}")


def load_frameworks(sources_path: str = SOURCES_PATH) -> list[dict[str, Any]]:
    """Load and validate the framework list from sources.json."""
    with open(sources_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    frameworks = data.get("frameworks", [])
    for fw in frameworks:
        _validate_framework(fw)
    return frameworks


def cutoff(since_days: int) -> datetime:
    """Return a timezone-aware datetime `since_days` days ago (UTC)."""
    return datetime.now(timezone.utc) - timedelta(days=since_days)


def parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 timestamp (GitHub style, e.g. 2024-01-01T00:00:00Z).

    Returns a tz-aware datetime, or None if the value can't be parsed.
    """
    if not value:
        return None
    try:
        normalized = value.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def gh_api(
    path: str,
    *,
    method: str | None = None,
    fields: dict[str, str] | None = None,
    raw_input: str | None = None,
) -> Any:
    """Call `gh api` and return parsed JSON.

    Raises subprocess.CalledProcessError on failure so callers can fail soft.
    """
    cmd = ["gh", "api", path]
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


def gh_graphql(query: str, variables: dict[str, str] | None = None) -> Any:
    """Run a GraphQL query through `gh api graphql` and return parsed JSON."""
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    for key, val in (variables or {}).items():
        cmd += ["-F", f"{key}={val}"]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout.strip() else None
