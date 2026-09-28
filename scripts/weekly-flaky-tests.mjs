const LOOKBACK_DAYS = 7;
const CONCURRENT_RUNS = 4;

function normalizeJobName(name) {
  return name
    .replace(/\(\s*(?:(?:(?:Node|TS)\s+)?\d+(?:\.\d+)*|\d+\/\d+)\s*\)/gi, ' ')
    .replace(/Playwright\s+(?:bundle\w*|esm|cjs)(?:\s+(?:chromium|firefox|webkit))?\s+Tests/gi, 'Playwright Tests')
    .replace(/-node-\d+(?:-\d+)*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTestName(name) {
  return name
    .replace(/^\[(?:chromium|firefox|webkit)\]\s*›\s*/i, '')
    .replace(/(\.[cm]?[jt]sx?):\d+:\d+/gi, '$1')
    .replace(/esm\/cjs\s*>\s*(?:esm|cjs)\b/gi, 'esm/cjs')
    .replace(/\besm\/cjs\s*>\s*/gi, '')
    .replace(/\s*\[(?:esm|cjs)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function markdownCell(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]|]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ');
}

export async function collectReport({ github, context, core, now = new Date() }) {
  const until = now.toISOString();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const repo = context.repo;
  core.info(`Listing develop CI runs from ${since} to ${until}.`);
  const listedRuns = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo,
    workflow_id: 'build.yml',
    branch: 'develop',
    created: `${since}..${until}`,
    per_page: 100,
  });
  const warnings = [];
  if (listedRuns.length >= 1000) {
    warnings.push('GitHub limits this query to 1,000 runs; this report may be incomplete.');
  }
  const runs = listedRuns.filter(run => ['push', 'schedule', 'workflow_dispatch'].includes(run.event));
  const tests = new Map();
  let failedJobsWithoutTests = 0;
  let failedJobs = 0;
  let completedRuns = 0;
  const pendingRuns = runs.filter(run => run.conclusion !== 'success' || run.run_attempt > 1);
  const runsToInspect = pendingRuns.length;
  core.info(
    `Found ${runs.length} runs; ${runsToInspect} need inspection, ${runs.length - runsToInspect} passed on the first attempt.`,
  );

  async function worker() {
    while (pendingRuns.length > 0) {
      const run = pendingRuns.shift();
      core.info(`Run ${run.id}: fetching jobs across ${run.run_attempt} attempt(s).`);

      const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
        ...repo,
        run_id: run.id,
        filter: 'all',
        per_page: 100,
      });
      const jobsToInspect = jobs.filter(job => job.conclusion === 'failure' && !job.name.includes('(optional)'));
      core.info(`Run ${run.id}: ${jobs.length} job attempts, ${jobsToInspect.length} failures to inspect.`);
      for (const job of jobsToInspect) {
        failedJobs++;

        let annotations;
        try {
          annotations = await github.paginate(github.rest.checks.listAnnotations, {
            ...repo,
            check_run_id: Number(job.check_run_url.split('/').pop()),
            per_page: 100,
          });
        } catch (error) {
          if (error.status !== 404 && error.status !== 410) {
            throw error;
          }
          warnings.push(`Annotations unavailable for job ${job.id} in run ${run.id}.`);
          continue;
        }

        const failures = annotations.filter(
          annotation =>
            annotation.annotation_level === 'failure' &&
            annotation.title &&
            /(?:^|\/)(?:tests?|__tests__|suites)\/|(?:^|[/.])(?:test|spec)\.[cm]?[jt]sx?$/i.test(annotation.path),
        );
        if (failures.length === 0) {
          failedJobsWithoutTests++;
        }

        for (const annotation of failures) {
          const family = normalizeJobName(job.name);
          const name = normalizeTestName(annotation.title);
          const key = JSON.stringify([family, annotation.path, name]);
          let test = tests.get(key);
          if (!test) {
            test = { family, path: annotation.path, name, runs: new Map() };
            tests.set(key, test);
          }
          if (!test.runs.has(run.id)) {
            test.runs.set(run.id, job.html_url);
          }
        }
      }
      completedRuns++;
      core.info(
        `Completed ${completedRuns}/${runsToInspect} runs; ${failedJobs} failed jobs inspected, ${tests.size} failing tests found.`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENT_RUNS }, () => worker()));

  return {
    since,
    until,
    runs: runs.length,
    failedJobs,
    failedJobsWithoutTests,
    warnings,
    tests: [...tests.values()].sort(
      (a, b) =>
        b.runs.size - a.runs.size ||
        a.name.localeCompare(b.name) ||
        a.family.localeCompare(b.family) ||
        a.path.localeCompare(b.path),
    ),
  };
}

export function renderReport(report, context) {
  const repositoryUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
  const reportUrl = `${repositoryUrl}/actions/runs/${context.runId}`;
  const lines = [
    '## Weekly test failures',
    '',
    `Develop · ${report.since.slice(0, 10)}–${report.until.slice(0, 10)} · ${report.runs} CI runs.`,
    '',
  ];

  if (report.tests.length === 0) {
    lines.push('No test failures found.');
  } else {
    lines.push('| Test | Job | Affected runs | Links to runs | Issue |', '| --- | --- | ---: | --- | --- |');
    for (const test of report.tests) {
      const runs = [...test.runs].sort(([a], [b]) => b - a);
      const links = runs.map(([id, url]) => `[${id}](${url})`).join(', ');
      const issueParams = new URLSearchParams({
        template: 'flaky.yml',
        title: `[Flaky CI]: ${test.name}`,
        'job-name': test.family,
        'test-name': test.name,
        'test-run-link': runs[0][1],
        details: `${markdownCell(test.path)}\n\nFailed in ${test.runs.size} CI runs on develop during ${report.since.slice(0, 10)}–${report.until.slice(0, 10)}.\n\n[Weekly report](${reportUrl})`,
      });
      const issueUrl = `${repositoryUrl}/issues/new?${issueParams}`;
      lines.push(
        `| ${markdownCell(test.name)} | ${markdownCell(test.family)} | ${test.runs.size} | ${links} | [Create issue](${issueUrl}) |`,
      );
    }
  }

  lines.push(
    '',
    `${report.failedJobs} failed job attempts; ${report.failedJobsWithoutTests} without test annotations. Optional jobs excluded.`,
    '',
    ...report.warnings.map(warning => `- ${markdownCell(warning)}`),
  );
  return `${lines.join('\n')}\n`;
}

export default async function run({ github, context, core }) {
  const report = await collectReport({ github, context, core });
  for (const warning of report.warnings) {
    core.warning(warning);
  }
  await core.summary.addRaw(renderReport(report, context)).write();
  return report;
}
