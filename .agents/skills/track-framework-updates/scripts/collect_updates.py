#!/usr/bin/env python3
"""Orchestrator for the track-framework-updates skill.

Runs the three fetchers (releases, discussions/RFCs, RSS) for the same date
window, merges their results per framework, drops frameworks with nothing new
(keeps the digest lean), and writes a single `framework-updates-raw.json` that
Claude then turns into the digest.

Each fetcher already fails soft per-framework, so one bad repo/feed never
aborts the run -- any errors are carried through into the raw artifact so they
show up in the digest's "Run notes" section instead of being silently lost.

Usage:
  collect_updates.py [--since-days N] [--out PATH]

Default output path is `framework-updates-raw.json` in the current directory.
"""

import argparse
import json
from datetime import datetime, timezone

import fetch_discussions
import fetch_releases
import fetch_rss


def _index_by_name(entries):
    return {entry["name"]: entry for entry in entries}


def merge(since_days):
    releases = _index_by_name(fetch_releases.collect(since_days))
    discussions = _index_by_name(fetch_discussions.collect(since_days))
    rss = _index_by_name(fetch_rss.collect(since_days))

    names = list(releases.keys()) or list(discussions.keys()) or list(rss.keys())
    merged = []
    for name in names:
        rel = releases.get(name, {})
        disc = discussions.get(name, {})
        feed = rss.get(name, {})

        errors = []
        if rel.get("error"):
            errors.append(rel["error"])
        errors += disc.get("errors", [])
        errors += feed.get("errors", [])

        entry = {
            "name": name,
            "sentryPackages": rel.get("sentryPackages") or disc.get("sentryPackages") or feed.get("sentryPackages", []),
            "category": rel.get("category"),
            "releases": rel.get("releases", []),
            "discussions": disc.get("discussions", []),
            "rfcs": disc.get("rfcs", []),
            "rssItems": feed.get("items", []),
            "errors": errors,
        }

        has_findings = entry["releases"] or entry["discussions"] or entry["rfcs"] or entry["rssItems"]
        if has_findings or errors:
            merged.append(entry)

    return merged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=7)
    parser.add_argument("--out", default="framework-updates-raw.json")
    args = parser.parse_args()

    frameworks = merge(args.since_days)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sinceDays": args.since_days,
        "frameworks": frameworks,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")

    total_releases = sum(len(f["releases"]) for f in frameworks)
    total_links = sum(len(f["discussions"]) + len(f["rfcs"]) + len(f["rssItems"]) for f in frameworks)
    print(
        f"Wrote {args.out}: {len(frameworks)} frameworks with activity, "
        f"{total_releases} releases, {total_links} links "
        f"(last {args.since_days} days)."
    )


if __name__ == "__main__":
    main()
