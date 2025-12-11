# Bump OpenTelemetry instrumentations

1. Ensure you're on the `develop` branch with the latest changes:
   - If you have unsaved changes, stash them with `git stash -u`.
   - If you're on a different branch than `develop`, check out the develop branch using `git checkout develop`.
   - Pull the latest updates from the remote repository by running `git pull origin develop`.

2. Create a new branch `bump-otel-{yyyy-mm-dd}`, e.g. `bump-otel-2025-03-03`

3. Create a new empty commit with the commit message `feat(deps): Bump OpenTelemetry instrumentations`

4. Push the branch and create a draft PR, note down the PR number as {PR_NUMBER}

5. Create a changelog entry in `CHANGELOG.md` under
   `- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott` with the following format:
   `- feat(deps): Bump OpenTelemetry instrumentations ([#{PR_NUMBER}](https://github.com/getsentry/sentry-javascript/pull/{PR_NUMBER}))`

6. Find the "Upgrade OpenTelemetry instrumentations" rule in `.cursor/rules/upgrade_opentelemetry_instrumentations` and
   follow those complete instructions step by step.
   - Create one commit per package in `packages/**` with the commit message
     `Bump OpenTelemetry instrumentations for {SDK}`, e.g. `Bump OpenTelemetry instrumentation for @sentry/node`

   - For each OpenTelemetry dependency bump, record an entry in the changelog with the format indented under the main
     entry created in step 5: `- Bump @opentelemetry/{instrumentation} from {previous_version} to {new_version}`, e.g.
     `- Bump @opentelemetry/instrumentation from 0.204.0 to 0.207.0` **CRITICAL**: Avoid duplicated entries, e.g. if we
     bump @opentelemetry/instrumentation in two packages, keep a single changelog entry.

7. Regenerate the yarn lockfile and run `yarn yarn-deduplicate`

8. Run `yarn fix` to fix all formatting issues

9. Finally update the PR description to list all dependency bumps
