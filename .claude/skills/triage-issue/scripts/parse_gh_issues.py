"""
Parse GitHub API JSON (single issue or search/issues) and print a concise summary.
Reads from stdin if no argument, else from the file path given as first argument.
Used by the triage-issue skill in CI so the AI does not need inline python3 -c in Bash.
"""
import json
import sys


def _sanitize_title(title: str) -> str:
    """One line, no leading/trailing whitespace, newlines replaced with space."""
    if not title:
        return ""
    return " ".join(str(title).split())


def _format_single_issue(data: dict) -> None:
    num = data.get("number")
    title = _sanitize_title(data.get("title", ""))
    state = data.get("state", "")
    print(f"#{num} {state} {title}")
    labels = data.get("labels", [])
    if labels:
        names = [l.get("name", "") for l in labels if isinstance(l, dict)]
        print(f"Labels: {', '.join(names)}")
    body = data.get("body") or ""
    if body:
        snippet = body[:200].replace("\n", " ")
        if len(body) > 200:
            snippet += "..."
        print(f"Body: {snippet}")


def _format_search_items(data: dict) -> None:
    items = data.get("items", [])
    for i in items:
        if not isinstance(i, dict):
            continue
        num = i.get("number", "")
        title = _sanitize_title(i.get("title", ""))
        state = i.get("state", "")
        print(f"{num} {title} {state}")


def main() -> None:
    if len(sys.argv) > 1:
        path = sys.argv[1]
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(f"parse_gh_issues: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        try:
            data = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            print(f"parse_gh_issues: {e}", file=sys.stderr)
            sys.exit(1)

    if not isinstance(data, dict):
        print("parse_gh_issues: expected a JSON object", file=sys.stderr)
        sys.exit(1)

    if "items" in data:
        _format_search_items(data)
    elif "number" in data:
        _format_single_issue(data)
    else:
        print("parse_gh_issues: expected 'items' (search) or 'number' (single issue)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
