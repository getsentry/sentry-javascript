#!/usr/bin/env python3
"""
Read Claude Code execution output JSON and write duration, cost, and status
to stdout as Markdown for GitHub Actions job summary (GITHUB_STEP_SUMMARY).

Usage:
  python3 write_job_summary.py <path-to-claude-execution-output.json>

Handles single JSON object or NDJSON (one JSON object per line).
Uses the last object with type "result" when multiple are present.

Job summary has a ~1MB limit; raw JSON is truncated if needed to avoid job abort.
"""

import json
import sys

# Stay under GITHUB_STEP_SUMMARY ~1MB limit; leave room for the table and text
MAX_RAW_BYTES = 800_000


def _append_raw_json_section(content: str, lines: list[str]) -> None:
    """Append a 'Full execution output' json block to lines, with truncation and fence escaping."""
    raw = content.strip()
    encoded = raw.encode("utf-8")
    if len(encoded) > MAX_RAW_BYTES:
        raw = encoded[:MAX_RAW_BYTES].decode("utf-8", errors="replace") + "\n\n... (truncated due to job summary size limit)"
    raw = raw.replace("```", "`\u200b``")
    lines.extend(["", "### Full execution output", "", "```json", raw, "```"])


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: write_job_summary.py <execution-output.json>", file=sys.stderr)
        return 1

    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as f:
            content = f.read()
    except OSError as e:
        msg = f"## Claude Triage Run\n\nCould not read execution output: {e}"
        print(msg, file=sys.stderr)
        print(msg)  # Also to stdout so job summary shows something
        return 1

    # Support single JSON or NDJSON (one object per line)
    results = []
    for line in content.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if obj.get("type") == "result":
                results.append(obj)
        except json.JSONDecodeError:
            continue

    if not results:
        # Try parsing whole content as single JSON
        try:
            obj = json.loads(content)
            if obj.get("type") == "result":
                results = [obj]
        except json.JSONDecodeError:
            pass

    if not results:
        no_result_lines = ["## Claude Triage Run", "", "No execution result found in output."]
        _append_raw_json_section(content, no_result_lines)
        print("\n".join(no_result_lines))
        return 0

    last = results[-1]
    duration_ms = last.get("duration_ms")
    num_turns = last.get("num_turns")
    total_cost = last.get("total_cost_usd")
    subtype = last.get("subtype", "")

    cost_str = f"${total_cost:.4f} USD" if isinstance(total_cost, (int, float)) else "n/a"
    lines = [
        "## Claude Triage Run",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Duration | {duration_ms if duration_ms is not None else 'n/a'} ms |",
        f"| Turns | {num_turns if num_turns is not None else 'n/a'} |",
        f"| Cost (USD) | {cost_str} |",
    ]
    if subtype == "error_max_turns":
        lines.extend([
            "",
            "⚠️ **Run stopped:** maximum turns reached. Consider increasing `max-turns` in the workflow or simplifying the issue scope.",
        ])
    elif subtype and subtype != "success":
        lines.extend([
            "",
            f"Result: `{subtype}`",
        ])

    _append_raw_json_section(content, lines)

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
