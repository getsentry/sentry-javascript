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

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any
from xml.etree import ElementTree

from _common import cutoff, load_frameworks, parse_iso

USER_AGENT = "sentry-javascript-track-framework-updates/1.0"
TIMEOUT_SECONDS = 20
MAX_FEED_BYTES = 5 * 1024 * 1024  # 5 MB — no legitimate RSS feed is this large
ATOM_NS = "{http://www.w3.org/2005/Atom}"


def _parse_date(value: str | None) -> datetime | None:
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


def _atom_link(entry: ElementTree.Element) -> str | None:
    """Extract the best link href from an Atom entry element."""
    fallback = None
    for link in entry.findall(f"{ATOM_NS}link"):
        href = link.get("href")
        if not href:
            continue
        if link.get("rel", "alternate") == "alternate":
            return href
        fallback = fallback or href
    return fallback


def parse_feed(xml_bytes: bytes) -> list[dict[str, str]]:
    """Return a list of {title, url, publishedAt} from an RSS or Atom document."""
    root = ElementTree.fromstring(xml_bytes)
    items: list[dict[str, str]] = []

    for item in root.iter("item"):
        pub_date = (
            item.findtext("pubDate")
            or item.findtext("{http://purl.org/dc/elements/1.1/}date")
            or ""
        )
        items.append(
            {
                "title": (item.findtext("title") or "").strip(),
                "url": (item.findtext("link") or "").strip(),
                "publishedAt": pub_date.strip(),
            }
        )

    for entry in root.iter(f"{ATOM_NS}entry"):
        published = (
            entry.findtext(f"{ATOM_NS}updated")
            or entry.findtext(f"{ATOM_NS}published")
            or ""
        )
        items.append(
            {
                "title": (entry.findtext(f"{ATOM_NS}title") or "").strip(),
                "url": _atom_link(entry) or "",
                "publishedAt": published.strip(),
            }
        )

    return items


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Block redirects to non-HTTPS URLs (prevents SSRF to internal services)."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> urllib.request.Request:
        if not newurl.startswith("https://"):
            raise urllib.error.URLError(
                f"Refusing non-HTTPS redirect to {newurl}"
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_SafeRedirectHandler)


def fetch_feed(url: str) -> bytes:
    """Download a feed URL and return raw bytes."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with _opener.open(req, timeout=TIMEOUT_SECONDS) as resp:
        data = resp.read(MAX_FEED_BYTES + 1)
        if len(data) > MAX_FEED_BYTES:
            raise ValueError(
                f"Feed exceeds {MAX_FEED_BYTES} byte limit, refusing to parse"
            )
        return data


def collect(since_days: int) -> list[dict[str, Any]]:
    since = cutoff(since_days)
    results = []
    for fw in load_frameworks():
        feeds = fw.get("rss") or []
        entry: dict[str, Any] = {
            "name": fw["name"],
            "sentryPackages": fw.get("sentryPackages", []),
            "items": [],
        }
        for feed_url in feeds:
            try:
                parsed = parse_feed(fetch_feed(feed_url))
            except (
                urllib.error.URLError,
                ElementTree.ParseError,
                ValueError,
            ) as exc:
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
        entry["items"].sort(
            key=lambda i: i.get("publishedAt") or "", reverse=True
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
