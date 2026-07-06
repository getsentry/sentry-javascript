#!/usr/bin/env python3
"""Check that sources.json covers all public @sentry/* packages.

Compares the package names found in packages/*/package.json with the
sentryPackages referenced in sources.json. Prints any public packages
not tracked by any framework entry.

Usage:
  check_sources.py   # prints JSON array to stdout

Output shape:
  ["@sentry/foo", ...]    (empty array when everything is covered)
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from _common import load_frameworks

REPO_ROOT = os.path.dirname(
    os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
)
PACKAGES_DIR = os.path.join(REPO_ROOT, "packages")

EXCLUDED_PACKAGES: set[str] = {
    # Internal build/dev tooling — not user-facing SDK packages.
    "@sentry/eslint-config-sdk",
    "@sentry/eslint-plugin-sdk",
    "@sentry/typescript",
    "@sentry-internal/integration-shims",
    # Internal utils / build tooling — not framework integrations.
    "@sentry/browser-utils",
    "@sentry/server-utils",
    "@sentry/bundler-plugins",
    # UX products — not framework integrations.
    "@sentry/feedback",
    "@sentry/replay",
    "@sentry/replay-canvas",
    "@sentry-internal/replay-worker",
    # Core packages — not tied to any upstream framework.
    "@sentry/core",
    "@sentry/types",
    "@sentry/browser",
    "@sentry/node-core",
    "@sentry/node-native",
    "@sentry/opentelemetry",
    "@sentry/profiling-node",
    "@sentry/wasm",
    "@sentry/vercel-edge",
}


def _all_package_names() -> set[str]:
    """Read the 'name' field from every packages/*/package.json."""
    names: set[str] = set()
    if not os.path.isdir(PACKAGES_DIR):
        return names
    for entry in os.listdir(PACKAGES_DIR):
        pkg_json = os.path.join(PACKAGES_DIR, entry, "package.json")
        if not os.path.isfile(pkg_json):
            continue
        with open(pkg_json, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        name = data.get("name")
        if name:
            names.add(name)
    return names


def _tracked_packages(frameworks: list[dict[str, Any]]) -> set[str]:
    """Collect every sentryPackage referenced in sources.json."""
    tracked: set[str] = set()
    for fw in frameworks:
        for pkg in fw.get("sentryPackages", []):
            tracked.add(pkg)
    return tracked


def check() -> list[str]:
    """Return sorted list of packages not tracked in sources.json and not excluded."""
    all_pkgs = _all_package_names()
    tracked = _tracked_packages(load_frameworks())
    return sorted(all_pkgs - tracked - EXCLUDED_PACKAGES)


def main() -> None:
    untracked = check()
    json.dump(untracked, sys.stdout, indent=2)
    sys.stdout.write("\n")
    if untracked:
        print(
            f"\n⚠  {len(untracked)} package(s) not tracked in sources.json:",
            file=sys.stderr,
        )
        for pkg in untracked:
            print(f"   - {pkg}", file=sys.stderr)
        print(
            "   Add them to sources.json or to EXCLUDED_PACKAGES in this script.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
