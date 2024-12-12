# Triaging

The term _triage_ originally comes from medicine and describes the process of quickly examining patients who are taken
to a hospital in order to decide which ones are the most seriously ill and must be treated first.

By _triaging issues_, we are evaluating problems that our customers are facing and providing the appropriate level of
support. The goal is to provide attention to all open issues, categorise them, and alert people when there are issues of
high severity. The goal is _not_ to fix all issues or answer all the questions coming from the open source community
immediately.

## Bug fixing 101

Not every bug is equally critical or time sensitive. Some things reported as bugs aren’t even bugs. If you are unsure
whether something needs fixing, just reach out to your colleagues and get their opinion. When you do fix a bug, it
should always go hand-in-hand with adding new tests (or improving existing ones), so we can avoid any regressions in the
future.

## Triaging workflow

There are a few different ways to triage issues:

1. You can look at the `#feed-web-frontend` channel in Slack. This channel will automatically receive a message every
   day in the morning with issues that require triaging.
2. You can look at the triage view in the GitHub Project Board: https://github.com/orgs/getsentry/projects/31/views/29
3. (Also for external contributors) You can filter by `Waiting for: Product Owner` label:
   https://github.com/getsentry/sentry-javascript/issues?q=is%3Aopen+is%3Aissue+label%3A%22Waiting+for%3A+Product+Owner%22

Generally, all new issues that are opened by external users will receive the `Waiting for: Product Owner` label
initially. Whenever a contributor replies to the issue, the label will be removed automatically. If/when an external
user replies again, the label will be re-added (indicating that a response from the repo owners is expected).

Note that issues created by contributors themselves will not get this label applied. They will also not be added to the
"Web SDK Frontend" board automatically. You'll have to add the "Web SDK Frontend" project manually to issues you create
yourself as a contributor.

If a user replies to an issue, leading to the label being re-applied, but no response is required by a contributor, you
may also remove the label manually, which will also remove it from the triage list.

Working through the triage queue should have the highest priority of tasks. Especially issues that are reaching the top
of the triage queue (which is indicated in the `#feed-web-frontend` channel through a remaining time to triage) should
be prioritised. **This does not mean that you need to fix the issue immediately,** but that you should investigate and
categorize the issue as soon as possible. If an issue is hard to fix, an edge case, or otherwise unclear, feel free to
reply and put the issue in backlog. You may also encourage the user to contribute a PR themselves if we are unlikely to
find time to resolve the issue ourselves anytime soon.

Additionally, triaging does not have to happen in one sitting. If you've invested a reasonable amount of time into
triaging an issue, but have not yet found the root cause/a solution, you can always post an update in the issue about
what you've tried so far (and what worked/didn't work), and continue looking into the issue later/on another day. This
depends on the severity of the issue, of course — if something appears to be a critical issue potentially affecting lots
of users, we should prioritise fixing it even if it takes longer.

If a ticket is in the Web SDK triaging queue, but should be handled by another team (e.g. Replay, Feedback, Profiling),
feel free to ping members of that team in a respective Slack channel to please take a look at the issue. You should also
make sure to apply the correct package labels (e.g. `Package: Replay`, `Package: User Feedback`,
`Package: profiling-node`) to indicate what an issue is about.

### (Sentry Employees) How & when should I triage issues?

Ideally, you can take some time every day in the morning to look over the triage queue and identify issues that you can
help triage. You will not be able to triage _every_ issue effectively, and it's OK to skip some issues if you don't know
what to do. That being said, it's important to split the triaging duty between the team members, so if you see a large
amount of issues that you cannot help with, try to find ways to help team members with their triage load in other ways.
Sometimes, this will mean taking some extra time to look into an issue. But remember, even if it takes you longer to
look into an issue than another colleague, you'll also learn stuff and you'll be more effective at triaging in the
future.

When you start looking into an issue, you may assign the issue to yourself. This indicates to other colleagues that
somebody else is already looking into the issue. Generally speaking, the first person to assign themselves/answer in the
issue is considered the owner of this triaging issue, and other colleagues will generally not look into this issue
anymore unless prompted. Still, if you stumble upon an issue and you feel like you have something productive to add to
the conversation, feel empowered to also comment on issues owned by somebody else. Make sure to follow up on issues you
started to triage, and/or pull in other colleagues as needed.

If a team member is out of office, make sure that issues this person started to triage continue to receive attention.

You can and should also move issues through the project board. You can set the status to:

- `Backlog`: May be done at some point
- `Todo`: Should be done, feel free to pick up this issue any time
- `In Progress`: This is being worked on
- `In Review`: PR is open
- `Done`

This helps have an overview of what is actively being worked on at any given time.

### (Sentry Employees) How much time should be spent triaging?

Generally, triaging should be distributed between the SDK team members as equally as possible. Every developer should
contribute to triaging as much as they can.

Overall, developers should not spend more than 2h per day triaging & reproducing issues. If you find yourself spending
more time than this, bring this up with your manager to find ways to optimize this better.

### (Sentry Employees) What about "inoffical" triaging?

In addition to Github issues, you may also be pulled into triaging duty in other ways, e.g. via Discord , StackOverflow,
GitHub Discussions, or Slack.

Generally, if non-trivial issues are raised this way, encourage the other parties to create issues on GitHub with as
much detail as possible, which also makes it easier for us to track the requests/issues. You should also include the
time you spend working on such issues in your general triaging time.

### How to approach triaging an unknown issue?

If you have no idea how to approach a given issue, there are a few general ways you could start:

1. Ask for a more thorough reproduction. Often, an issue does not contain enough information for us to figure out what
   is going on. Feel free to ask liberally for more information, if the provided information is not enough.
2. Ask users to enable debug logs (`Sentry.intit({ debug: true })`), and paste the logs for their app. This can contain
   valuable information for debugging issues.
3. Ask colleagues who may have some experience with a category of issues.
