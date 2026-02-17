import json, os, sys, urllib.request, urllib.parse


def graphql(token, query, variables=None):
    payload = json.dumps({"query": query, **({"variables": variables} if variables else {})}).encode()
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# --- Inputs ---
identifier = sys.argv[1]       # e.g. "JS-1669"
report_path = sys.argv[2]      # e.g. "/tmp/triage_report.md"
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
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read()).get("access_token", "")
if not token:
    print("Failed to obtain Linear access token")
    sys.exit(1)

# --- Fetch issue UUID ---
data = graphql(token, '{ issue(id: "%s") { id identifier url } }' % identifier)
issue = data.get("data", {}).get("issue")
if not issue:
    print(f"Linear issue {identifier} not found")
    sys.exit(1)
issue_id = issue["id"]

# --- Check for existing triage comment (idempotency) ---
data = graphql(token, '{ issue(id: "%s") { comments { nodes { body } } } }' % identifier)
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
