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
      const vars = {
        JOB_NAME: jobName,
        RUN_LINK: jobUrl,
        TEST_NAME: testName,
      };

      let title = frontmatter.match(/title:\s*'(.*)'/)[1];
      let issueBody = bodyTemplate;
      for (const [key, value] of Object.entries(vars)) {
        const pattern = new RegExp(`\\{\\{\\s*env\\.${key}\\s*\\}\\}`, 'g');
        title = title.replace(pattern, value);
        issueBody = issueBody.replace(pattern, value);
      }

      const existingIssue = existing.find(i => i.title === title);

      if (existingIssue) {
        core.info(`Issue already exists for "${testName}" in ${jobName}: #${existingIssue.number}`);
        continue;
      }

      const newIssue = await github.rest.issues.create({
        owner,
        repo,
        title,
        body: issueBody.trim(),
        labels: ['Tests'],
      });
      core.info(`Created issue #${newIssue.data.number} for "${testName}" in ${jobName}`);
    }
  }
}
