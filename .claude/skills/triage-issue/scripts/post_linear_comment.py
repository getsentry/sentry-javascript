import json, os, re, sys, urllib.error, urllib.request, urllib.parse

TIMEOUT_SECONDS = 30
IDENTIFIER_PATTERN = re.compile(r"^[A-Z]+-\d+$")
# In CI only the workspace (cwd) is writable; /tmp/ is allowed for local runs
ALLOWED_REPORT_PREFIXES = ("/tmp/", os.path.abspath(os.getcwd()) + os.sep)


def _report_path_allowed(path: str) -> bool:
    abs_path = os.path.abspath(path)
    return any(abs_path.startswith(p) for p in ALLOWED_REPORT_PREFIXES)


def graphql(token, query, variables=None):
    payload = json.dumps({"query": query, **({"variables": variables} if variables else {})}).encode()
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"Linear API error {e.code}: {body}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Linear API request failed: {e.reason}")
        sys.exit(1)


# --- Inputs ---
identifier = sys.argv[1]       # e.g. "JS-1669"
report_path = sys.argv[2]      # e.g. "triage_report.md" (repo root; in CI use repo root only)

if not IDENTIFIER_PATTERN.match(identifier):
    print(f"Invalid identifier format: {identifier}")
    sys.exit(1)

if not _report_path_allowed(report_path):
    print(
        f"Report path must be under current working directory ({os.getcwd()}) or /tmp/. In CI use repo root, e.g. triage_report.md"
    )
    sys.exit(1)

client_id = os.environ["LINEAR_CLIENT_ID"]
client_secret = os.environ["LINEAR_CLIENT_SECRET"]

# --- Obtain access token ---
token_data = urllib.parse.urlencode({
    "grant_type": "client_credentials",
    "client_id": client_id,
    "client_secret": client_secret,
    "scope": "issues:create,read,comments:create",
}).encode()
req = urllib.request.Request("https://api.linear.app/oauth/token", data=token_data,
    headers={"Content-Type": "application/x-www-form-urlencoded"})
try:
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        token = json.loads(resp.read()).get("access_token", "")
except (urllib.error.HTTPError, urllib.error.URLError) as e:
    print(f"Failed to obtain Linear access token: {e}")
    sys.exit(1)
if not token:
    print("Failed to obtain Linear access token")
    sys.exit(1)

# --- Fetch issue UUID ---
data = graphql(token,
    "query GetIssue($id: String!) { issue(id: $id) { id identifier url } }",
    {"id": identifier},
)
issue = data.get("data", {}).get("issue")
if not issue:
    print(f"Linear issue {identifier} not found")
    sys.exit(1)
issue_id = issue["id"]

# --- Check for existing triage comment (idempotency) ---
data = graphql(token,
    "query GetComments($id: String!) { issue(id: $id) { comments { nodes { body } } } }",
    {"id": identifier},
)
comments = data.get("data", {}).get("issue", {}).get("comments", {}).get("nodes", [])
for c in comments:
    if c.get("body", "").startswith("## Automated Triage Report"):
        print(f"Triage comment already exists on {identifier}, skipping")
        sys.exit(0)

# --- Post comment ---
with open(report_path) as f:
    body = f.read()
data = graphql(token,
    "mutation CommentCreate($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }",
    {"input": {"issueId": issue_id, "body": body}},
)
if data.get("data", {}).get("commentCreate", {}).get("success"):
    print(f"Triage comment posted on {identifier}: {issue['url']}")
else:
    print(f"Failed to post triage comment: {json.dumps(data)}")
    sys.exit(1)
