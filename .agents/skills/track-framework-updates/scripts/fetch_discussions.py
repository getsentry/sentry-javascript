#!/usr/bin/env python3
"""Fetch recent GitHub Discussions and RFC-repo activity -- links only.

Per the skill spec we do NOT summarize discussions; we only surface links to
recently-active ones so a human can decide what's worth reading. Two sources:

  1. Discussions on the main repo (when `github.discussions` is true), via the
     GraphQL API (`gh api graphql`) -- REST has no discussions list endpoint.
  2. An optional dedicated RFC repo (`github.rfcsRepo`), where proposals live as
     pull requests / issues. We surface recently-updated PRs via REST.

Both are filtered to the date window and fail soft per-framework.

Usage:
  fetch_discussions.py [--since-days N]   # prints JSON to stdout

Output shape:
  [
    {
      "name": "Vue",
      "sentryPackages": ["@sentry/vue"],
      "discussions": [{"title": "...", "url": "...", "category": "...", "updatedAt": "..."}],
      "rfcs": [{"title": "...", "url": "...", "state": "open", "updatedAt": "..."}]
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

from _common import cutoff, gh_api, gh_graphql, load_frameworks, parse_iso

DISCUSSIONS_QUERY = """
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    discussions(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        title
        url
        updatedAt
        category { name }
      }
    }
  }
}
"""


def fetch_discussions(
    repo: str, since: datetime, categories: list[str] | None
) -> list[dict[str, Any]]:
    """Return recently-updated discussions for `repo`."""
    owner, name = repo.split("/", 1)
    data = gh_graphql(DISCUSSIONS_QUERY, {"owner": owner, "repo": name})

    nodes = (
        (((data or {}).get("data") or {}).get("repository") or {})
        .get("discussions", {})
        .get("nodes")
        or []
    )

    wanted = {c.lower() for c in (categories or [])}
    out = []
    for node in nodes:
        updated = parse_iso(node.get("updatedAt"))
        if updated is None or updated < since:
            continue
        category = (node.get("category") or {}).get("name") or ""
        if wanted and category.lower() not in wanted:
            continue
        out.append(
            {
                "title": node.get("title"),
                "url": node.get("url"),
                "category": category,
                "updatedAt": node.get("updatedAt"),
            }
        )
    return out


def fetch_rfcs(rfcs_repo: str, since: datetime) -> list[dict[str, Any]]:
    """Recently-updated PRs in a dedicated RFCs repo (proposals live as PRs)."""
    prs = (
        gh_api(
            f"repos/{rfcs_repo}/pulls",
            fields={
                "state": "all",
                "sort": "updated",
                "direction": "desc",
                "per_page": "50",
            },
        )
        or []
    )
    out = []
    for pr in prs:
        updated = parse_iso(pr.get("updated_at"))
        if updated is None or updated < since:
            continue
        out.append(
            {
                "title": pr.get("title"),
                "url": pr.get("html_url"),
                "state": pr.get("state"),
                "updatedAt": pr.get("updated_at"),
            }
        )
    return out


def collect(since_days: int) -> list[dict[str, Any]]:
    since = cutoff(since_days)
    results = []
    for fw in load_frameworks():
        gh = fw.get("github") or {}
        entry: dict[str, Any] = {
            "name": fw["name"],
            "sentryPackages": fw.get("sentryPackages", []),
            "discussions": [],
            "rfcs": [],
        }
        repo = gh.get("repo")
        if repo and gh.get("discussions"):
            try:
                entry["discussions"] = fetch_discussions(
                    repo, since, gh.get("discussionCategories")
                )
            except subprocess.CalledProcessError as exc:
                entry.setdefault("errors", []).append(
                    f"discussions {repo}: {exc.stderr.strip()[:300]}"
                )
            except (ValueError, KeyError) as exc:
                entry.setdefault("errors", []).append(
                    f"discussions {repo}: {exc}"
                )
        if gh.get("rfcsRepo"):
            try:
                entry["rfcs"] = fetch_rfcs(gh["rfcsRepo"], since)
            except subprocess.CalledProcessError as exc:
                entry.setdefault("errors", []).append(
                    f"rfcs {gh['rfcsRepo']}: {exc.stderr.strip()[:300]}"
                )
            except (ValueError, KeyError) as exc:
                entry.setdefault("errors", []).append(
                    f"rfcs {gh['rfcsRepo']}: {exc}"
                )
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
