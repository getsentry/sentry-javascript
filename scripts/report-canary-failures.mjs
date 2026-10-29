const ISSUE_LABELS = ['Type: Tests', 'Waiting for: Product Owner'];
const FAILED_CONCLUSIONS = ['failure', 'timed_out'];

export function issueTitle(testApplication) {
  return `Canary tests failed: ${testApplication}`;
}

// Must match the `name` of `job_e2e_tests` in .github/workflows/canary.yml
function jobName(include) {
  return `E2E ${include.label || include['test-application']} Test`;
}

/**
 * Groups the failed canary jobs of a run by test application.
 *
 * @param {{ include: Array<Record<string, string>> }} matrix
 * @param {Array<{ name: string; conclusion: string | null; html_url: string | null }>} jobs
 * @returns {Map<string, Array<{ label: string; url: string | null }>>}
 */
export function getFailedVariantsByApp(matrix, jobs) {
  const failedJobs = new Map(
    jobs.filter(job => FAILED_CONCLUSIONS.includes(job.conclusion)).map(job => [job.name, job.html_url]),
  );

  const failedVariantsByApp = new Map();
  for (const include of matrix.include) {
    const name = jobName(include);
    if (!failedJobs.has(name)) {
      continue;
    }

    const app = include['test-application'];
    const variants = failedVariantsByApp.get(app) || [];
    variants.push({ label: include.label || app, url: failedJobs.get(name) });
    failedVariantsByApp.set(app, variants);
  }

  return failedVariantsByApp;
}

function renderVariants(variants) {
  return variants.map(({ label, url }) => (url ? `- [${label}](${url})` : `- ${label}`)).join('\n');
}

function renderIssueBody(app, variants, runUrl) {
  return `The canary tests for \`${app}\` failed: ${runUrl}

Failed variants:
${renderVariants(variants)}

Canary tests run the \`canaryVariants\` of the test application against upstream prereleases. Until this issue is
closed, new failures of \`${app}\` are posted as comments here.`;
}

function renderComment(variants, runUrl) {
  return `Still failing: ${runUrl}

${renderVariants(variants)}`;
}

/**
 * Opens one issue per failed test application, or comments on the open issue for that application.
 */
export default async function run({ github, context, core, matrix }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;

  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    owner,
    repo,
    run_id: context.runId,
    filter: 'latest',
    per_page: 100,
  });

  const failedVariantsByApp = getFailedVariantsByApp(matrix, jobs);
  if (failedVariantsByApp.size === 0) {
    core.info('No failed canary tests found.');
    return;
  }

  const openIssues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });
  const openIssuesByTitle = new Map(
    openIssues.filter(issue => !issue.pull_request).map(issue => [issue.title, issue.number]),
  );

  for (const [app, variants] of failedVariantsByApp) {
    const title = issueTitle(app);
    const existingIssueNumber = openIssuesByTitle.get(title);

    if (existingIssueNumber) {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: existingIssueNumber,
        body: renderComment(variants, runUrl),
      });
      core.info(`${app}: commented on #${existingIssueNumber}`);
      continue;
    }

    const { data: issue } = await github.rest.issues.create({
      owner,
      repo,
      title,
      labels: ISSUE_LABELS,
      body: renderIssueBody(app, variants, runUrl),
    });
    core.info(`${app}: opened #${issue.number}`);
  }
}
