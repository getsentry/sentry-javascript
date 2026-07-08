#!/usr/bin/env python3
"""Read Claude Code execution output JSON and write run metrics as Markdown.

Intended for GitHub Actions job summary ($GITHUB_STEP_SUMMARY). Outputs a
compact metrics table followed by the digest content (if available).

Usage:
  python3 write_job_summary.py <execution-output.json> [digest.md]
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(
            "Usage: write_job_summary.py <execution-output.json> [digest.md]",
            file=sys.stderr,
        )
        return 1

    exec_path = sys.argv[1]
    digest_path = sys.argv[2] if len(sys.argv) > 2 else None

    # Parse execution output for metrics
    duration_ms = None
    num_turns = None
    total_cost = None
    subtype = ""

    try:
        with open(exec_path, encoding="utf-8") as f:
            content = f.read()

        results = []
        for line in content.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and obj.get("type") == "result":
                    results.append(obj)
                elif isinstance(obj, list):
                    for item in obj:
                        if isinstance(item, dict) and item.get("type") == "result":
                            results.append(item)
            except json.JSONDecodeError:
                continue

        if not results:
            try:
                obj = json.loads(content)
                if isinstance(obj, dict) and obj.get("type") == "result":
                    results = [obj]
                elif isinstance(obj, list):
                    results = [
                        item
                        for item in obj
                        if isinstance(item, dict) and item.get("type") == "result"
                    ]
            except json.JSONDecodeError:
                pass

        if results:
            last = results[-1]
            duration_ms = last.get("duration_ms")
            num_turns = last.get("num_turns")
            total_cost = last.get("total_cost_usd")
            subtype = last.get("subtype", "")

    except OSError as e:
        print(f"Could not read execution output: {e}", file=sys.stderr)

    # Build summary: digest first, run metrics at the bottom
    lines: list[str] = []

    # Digest content on top
    if digest_path:
        try:
            with open(digest_path, encoding="utf-8") as f:
                digest = f.read().strip()
            if digest:
                lines.append(digest)
        except OSError:
            lines.append("_Digest file not found._")

    # Run metrics at the bottom
    cost_str = (
        f"${total_cost:.4f}" if isinstance(total_cost, (int, float)) else "n/a"
    )
    duration_str = (
        f"{duration_ms / 1000:.0f}s"
        if isinstance(duration_ms, (int, float))
        else "n/a"
    )

    lines.extend([
        "",
        "---",
        "",
        "### Run metrics",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Duration | {duration_str} |",
        f"| Turns | {num_turns if num_turns is not None else 'n/a'} |",
        f"| Cost (USD) | {cost_str} |",
    ])

    if subtype == "error_max_turns":
        lines.extend(["", "> **Run stopped:** maximum turns reached."])
    elif subtype and subtype != "success":
        lines.extend(["", f"> Result: `{subtype}`"])

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
