/**
 * CI Failure Reporter script.
 *
 * Creates GitHub issues for tests that fail on the develop branch.
 * For each failed job in the workflow run, it fetches check run annotations
 * to identify individual failing tests, then creates one issue per failing
 * test using the FLAKY_CI_FAILURE_TEMPLATE.md template. Existing open issues
 * with matching titles are skipped to avoid duplicates.
 *
 * Intended to be called from a GitHub Actions workflow via actions/github-script:
 *
 *   const { default: run } = await import(
 *     `${process.env.GITHUB_WORKSPACE}/scripts/report-ci-failures.mjs`
 *   );
 *   await run({ github, context, core });
 */

import { readFileSync } from 'node:fs';

/**
 * Collapse matrix variants of a job name so the same test failing across the matrix dedupes to a
 * single issue instead of one per node/TS version. We strip only version-like parenthetical groups
 * — a bare number (e.g. node version) or a `TS x.y` bracket — leaving other parentheticals (e.g.
 * `(nextjs-app, 20)`) intact:
 *
 *   "Node (22) Integration Tests"          -> "Node Integration Tests"
 *   "Node (24) Integration Tests"          -> "Node Integration Tests"
 *   "Node (24) (TS 3.8) Integration Tests" -> "Node Integration Tests"
 */
function normalizeJobName(name) {
  return name
    .replace(/\(\s*(?:\d+|TS\s+[\d.]+)\s*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Collapse esm/cjs variants of a test name so the same test failing in both module formats dedupes
 * to a single issue instead of one per variant:
 *
 *   "... > esm/cjs > esm > should send messages" -> "... > esm/cjs > should send messages"
 *   "... > esm/cjs > cjs > should send messages" -> "... > esm/cjs > should send messages"
 */
function normalizeTestName(name) {
  return name
    .replace(/esm\/cjs\s*>\s*(?:esm|cjs)\b/gi, 'esm/cjs')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyVars(text, vars) {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{\\s*env\\.${key}\\s*\\}\\}`, 'g'), value);
  }
  return result;
}

export default async function run({ github, context, core }) {
  const { owner, repo } = context.repo;

  // Fetch actual job details from the API to get descriptive names
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    owner,
    repo,
    run_id: context.runId,
    per_page: 100,
  });

  const failedJobs = jobs.filter(job => job.conclusion === 'failure' && !job.name.includes('(optional)'));

  if (failedJobs.length === 0) {
    core.info('No failed jobs found');
    return;
  }

  // Read and parse template
  const template = readFileSync('.github/FLAKY_CI_FAILURE_TEMPLATE.md', 'utf8');
  const [, frontmatter, bodyTemplate] = template.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const titleTemplate = frontmatter.match(/title:\s*'(.*)'/)[1];

  // Titles we've already created or matched in this run, so the same flaky test failing on
  // multiple matrix jobs within a single run doesn't open duplicate issues (the `existing` list
  // below is fetched once and won't include issues created earlier in this same run).
  const handledTitles = new Set();

  // Get existing open issues with Tests label
  const existing = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    labels: 'Tests',
    per_page: 100,
  });

  for (const job of failedJobs) {
    const jobName = job.name;
    const normalizedJobName = normalizeJobName(jobName);
    const jobUrl = job.html_url;

    // Fetch annotations from the check run to extract failed test names
    let testNames = [];
    try {
      const annotations = await github.paginate(github.rest.checks.listAnnotations, {
        owner,
        repo,
        check_run_id: job.id,
        per_page: 100,
      });

      const testAnnotations = annotations.filter(a => a.annotation_level === 'failure' && a.path !== '.github');
      testNames = [...new Set(testAnnotations.map(a => a.title || a.path))];
    } catch (e) {
      core.info(`Could not fetch annotations for ${jobName}: ${e.message}`);
    }

    // If no test names found, abort - this could mean something else, e.g. cache restoration or similar fails
    // and also the issue is not super helpful in this case
    if (testNames.length === 0) {
      continue;
    }

    // Create one issue per failing test for proper deduplication
    for (const testName of testNames) {
      const normalizedTestName = normalizeTestName(testName);

      // The title is keyed on the *normalized* job name + test name so the same test failing across
      // matrix variants (different node / TS versions) or module formats (esm / cjs) dedupes to a
      // single issue.
      const title = applyVars(titleTemplate, { JOB_NAME: normalizedJobName, TEST_NAME: normalizedTestName });
      // The body keeps the concrete job name + run link of the variant that actually failed.
      const issueBody = applyVars(bodyTemplate, { JOB_NAME: jobName, RUN_LINK: jobUrl, TEST_NAME: testName });

      if (handledTitles.has(title)) {
        continue;
      }
      handledTitles.add(title);

      const existingIssue = existing.find(i => i.title === title);
      if (existingIssue) {
        core.info(`Issue already exists for "${normalizedTestName}" in ${normalizedJobName}: #${existingIssue.number}`);
        continue;
      }

      const newIssue = await github.rest.issues.create({
        owner,
        repo,
        title,
        body: issueBody.trim(),
        labels: ['Tests', 'Bug', 'Flaky Test'],
      });
      core.info(`Created issue #${newIssue.data.number} for "${normalizedTestName}" in ${normalizedJobName}`);
    }
  }
}
