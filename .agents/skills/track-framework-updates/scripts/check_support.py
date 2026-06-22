#!/usr/bin/env python3
"""Check current SDK support ranges for each tracked framework.

Reads peerDependencies from packages/*/package.json and lists existing E2E test
applications to produce a support-status snapshot. This gives the classification
step factual context about what's already supported vs. what would be new.

Usage:
  check_support.py   # prints JSON to stdout

Output shape:
  [
    {
      "name": "Angular",
      "sentryPackages": ["@sentry/angular"],
      "supportRanges": {"@angular/core": ">= 14.x <= 22.x", ...},
      "e2eApps": ["angular-17", "angular-18", ...]
    },
    ...
  ]
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from _common import SOURCES_PATH, load_frameworks

REPO_ROOT = os.path.dirname(
    os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
)
PACKAGES_DIR = os.path.join(REPO_ROOT, "packages")
E2E_APPS_DIR = os.path.join(
    REPO_ROOT, "dev-packages", "e2e-tests", "test-applications"
)


def _read_peer_deps(sentry_package: str) -> dict[str, str]:
    """Read peerDependencies from a @sentry/* package, excluding internal deps."""
    pkg_name = sentry_package.replace("@sentry/", "")
    pkg_json_path = os.path.join(PACKAGES_DIR, pkg_name, "package.json")
    if not os.path.isfile(pkg_json_path):
        return {}
    with open(pkg_json_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    peers = data.get("peerDependencies", {})
    return {k: v for k, v in peers.items() if not k.startswith("@sentry/")}


def _find_e2e_apps(framework_name: str) -> list[str]:
    """Find E2E test application directories matching a framework name."""
    if not os.path.isdir(E2E_APPS_DIR):
        return []
    name_lower = framework_name.lower()
    # Map framework names to E2E test app directory prefixes.
    # Order matters: check specific names before generic ones.
    prefix_map: list[tuple[str, list[str]]] = [
        ("next", ["nextjs-"]),
        ("sveltekit", ["sveltekit-", "sveltekit-"]),
        ("react router", ["react-router-", "create-remix-"]),
        ("remix", ["react-router-", "create-remix-"]),
        ("tanstack", ["tanstackstart-", "tanstack-"]),
        ("solidstart", ["solidstart"]),
        ("solid", ["solid", "solidstart"]),
        ("nestjs", ["nestjs-"]),
        ("nuxt", ["nuxt-"]),
        ("astro", ["astro-"]),
        ("hono", ["hono-"]),
        ("ember", ["ember-"]),
        ("angular", ["angular-"]),
        ("react", ["react-"]),
        ("vue", ["vue-"]),
        ("svelte", ["svelte-"]),
        ("effect", ["effect-"]),
        ("elysia", ["elysia-"]),
        ("nitro", ["nitro-"]),
    ]
    prefixes: list[str] = []
    for keyword, plist in prefix_map:
        if keyword in name_lower:
            prefixes = plist
            break
    if not prefixes:
        prefixes = [name_lower.replace(" ", "-")]

    apps = []
    for entry in sorted(os.listdir(E2E_APPS_DIR)):
        if any(entry.startswith(p) for p in prefixes):
            apps.append(entry)
    return apps


def collect() -> list[dict[str, Any]]:
    results = []
    for fw in load_frameworks():
        sentry_packages = fw.get("sentryPackages", [])
        all_peers: dict[str, str] = {}
        for pkg in sentry_packages:
            all_peers.update(_read_peer_deps(pkg))

        results.append(
            {
                "name": fw["name"],
                "sentryPackages": sentry_packages,
                "supportRanges": all_peers,
                "e2eApps": _find_e2e_apps(fw["name"]),
            }
        )
    return results


def main() -> None:
    json.dump(collect(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
