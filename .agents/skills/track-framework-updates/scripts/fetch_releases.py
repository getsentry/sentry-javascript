#!/usr/bin/env python3
"""Fetch GitHub releases published within the date window for each framework.

Uses the authenticated GitHub CLI (`gh api`) so no token handling lives here.
Each framework is fetched independently and failures are reported per-framework
rather than aborting the whole run -- one rate-limited or renamed repo should
never sink the weekly digest.

Usage:
  fetch_releases.py [--since-days N]   # prints JSON to stdout

Output shape:
  [
    {
      "name": "React",
      "sentryPackages": ["@sentry/react"],
      "category": "client",
      "releases": [
        {"tag": "v19.0.0", "name": "19.0.0", "url": "...", "publishedAt": "...", "body": "..."}
      ]
    },
    ...
  ]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from typing import Any

from _common import cutoff, gh_api, load_frameworks, parse_iso

MAX_BODY_CHARS = 8000
RELEASES_PER_PAGE = 100


def fetch_releases_for_repo(repo: str, since: datetime) -> list[dict[str, Any]]:
    """Return releases for `repo` published at/after `since`."""
    releases = (
        gh_api(
            f"repos/{repo}/releases",
            fields={"per_page": str(RELEASES_PER_PAGE)},
        )
        or []
    )
    recent = []
    for rel in releases:
        published = parse_iso(rel.get("published_at"))
        if published is None or published < since:
            continue
        body = rel.get("body") or ""
        recent.append(
            {
                "tag": rel.get("tag_name"),
                "name": rel.get("name") or rel.get("tag_name"),
                "url": rel.get("html_url"),
                "publishedAt": rel.get("published_at"),
                "prerelease": bool(rel.get("prerelease")),
                "body": body[:MAX_BODY_CHARS],
            }
        )
    recent.sort(key=lambda r: r.get("publishedAt") or "", reverse=True)
    return recent


def collect(since_days: int) -> list[dict[str, Any]]:
    since = cutoff(since_days)
    results = []
    for fw in load_frameworks():
        repo = (fw.get("github") or {}).get("repo")
        entry: dict[str, Any] = {
            "name": fw["name"],
            "sentryPackages": fw.get("sentryPackages", []),
            "category": fw.get("category"),
            "releases": [],
        }
        if repo:
            try:
                entry["releases"] = fetch_releases_for_repo(repo, since)
            except subprocess.CalledProcessError as exc:
                entry["error"] = (
                    f"gh api failed for {repo} (exit code {exc.returncode})"
                )
            except (ValueError, KeyError) as exc:
                entry["error"] = f"parse error for {repo}: {exc}"
        results.append(entry)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=7)
    args = parser.parse_args()
    json.dump(collect(args.since_days), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
