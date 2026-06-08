#!/usr/bin/env python3
"""Fetch blog/changelog RSS & Atom feed items published within the date window.

Stdlib only (`urllib` + `xml.etree`) so we don't add a dependency like
feedparser to the repo. Handles both RSS 2.0 (`<item>` + RFC-822 `<pubDate>`)
and Atom (`<entry>` + ISO-8601 `<updated>`/`<published>`). Feeds fail soft:
a single unreachable or malformed feed is recorded as an error and skipped.

Usage:
  fetch_rss.py [--since-days N]   # prints JSON to stdout

Output shape:
  [
    {
      "name": "React",
      "sentryPackages": ["@sentry/react"],
      "items": [{"title": "...", "url": "...", "publishedAt": "...", "feed": "..."}]
    },
    ...
  ]
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

from _common import cutoff, load_frameworks, parse_iso

USER_AGENT = "sentry-javascript-track-framework-updates/1.0"
TIMEOUT_SECONDS = 20

ATOM_NS = "{http://www.w3.org/2005/Atom}"


def _parse_date(value):
    """Parse either an RFC-822 (RSS) or ISO-8601 (Atom) timestamp."""
    if not value:
        return None
    value = value.strip()
    dt = parse_iso(value)
    if dt is not None:
        return dt
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None


def _atom_link(entry):
    # Prefer rel="alternate"; fall back to the first link with an href.
    fallback = None
    for link in entry.findall(f"{ATOM_NS}link"):
        href = link.get("href")
        if not href:
            continue
        if link.get("rel", "alternate") == "alternate":
            return href
        fallback = fallback or href
    return fallback


def parse_feed(xml_bytes):
    """Return a list of {title, url, publishedAt} from an RSS or Atom document."""
    root = ElementTree.fromstring(xml_bytes)
    items = []

    # RSS 2.0: <rss><channel><item>...
    for item in root.iter("item"):
        items.append(
            {
                "title": (item.findtext("title") or "").strip(),
                "url": (item.findtext("link") or "").strip(),
                "publishedAt": (item.findtext("pubDate") or item.findtext("{http://purl.org/dc/elements/1.1/}date") or "").strip(),
            }
        )

    # Atom: <feed><entry>...
    for entry in root.iter(f"{ATOM_NS}entry"):
        published = entry.findtext(f"{ATOM_NS}updated") or entry.findtext(f"{ATOM_NS}published") or ""
        items.append(
            {
                "title": (entry.findtext(f"{ATOM_NS}title") or "").strip(),
                "url": _atom_link(entry) or "",
                "publishedAt": published.strip(),
            }
        )

    return items


def fetch_feed(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        return resp.read()


def collect(since_days):
    since = cutoff(since_days)
    results = []
    for fw in load_frameworks():
        feeds = fw.get("rss") or []
        entry = {
            "name": fw["name"],
            "sentryPackages": fw.get("sentryPackages", []),
            "items": [],
        }
        for feed_url in feeds:
            try:
                parsed = parse_feed(fetch_feed(feed_url))
            except (urllib.error.URLError, ElementTree.ParseError, ValueError) as exc:
                entry.setdefault("errors", []).append(f"{feed_url}: {exc}")
                continue
            for item in parsed:
                published = _parse_date(item.get("publishedAt"))
                if published is None or published < since:
                    continue
                entry["items"].append(
                    {
                        "title": item["title"],
                        "url": item["url"],
                        "publishedAt": item["publishedAt"],
                        "feed": feed_url,
                    }
                )
        entry["items"].sort(key=lambda i: i.get("publishedAt") or "", reverse=True)
        results.append(entry)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=7)
    args = parser.parse_args()
    json.dump(collect(args.since_days), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
