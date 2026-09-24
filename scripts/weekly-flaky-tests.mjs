import { normalizeJobName, normalizeTestName } from './report-ci-failures.mjs';

const LOOKBACK_DAYS = 7;
const MAX_TESTS = 10;

function jobFamily(name) {
  return normalizeJobName(
    name
      .replace(/\(\d+(?:\.\d+)+\)/g, '')
      .replace(/(Playwright\s+\S+)\s+(?:chromium|firefox|webkit)(?=\s+Tests)/g, '$1'),
  );
}

function markdownCell(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]|]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ');
}

export async function collectReport({ github, context, now = new Date() }) {
  const until = now.toISOString();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const repo = context.repo;
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

  for (const run of runs) {
    if (run.conclusion === 'success' && run.run_attempt === 1) {
      continue;
    }

    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
      ...repo,
      run_id: run.id,
      filter: 'all',
      per_page: 100,
    });
    for (const job of jobs) {
      if (job.conclusion !== 'failure' || job.name.includes('(optional)')) {
        continue;
      }
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

      // Match the exact matrix job, not its normalized family, when checking recovery.
      const recovered = jobs.some(
        later =>
          later.name === job.name &&
          later.head_sha === job.head_sha &&
          later.run_attempt > job.run_attempt &&
          later.conclusion === 'success',
      );
      for (const annotation of failures) {
        const family = jobFamily(job.name);
        const name = normalizeTestName(annotation.title);
        const key = JSON.stringify([family, annotation.path, name]);
        let test = tests.get(key);
        if (!test) {
          test = {
            family,
            path: annotation.path,
            name,
            runs: new Set(),
            recoveredRuns: new Set(),
            examples: new Map(),
          };
          tests.set(key, test);
        }
        test.runs.add(run.id);
        if (recovered) {
          test.recoveredRuns.add(run.id);
        }
        if (test.examples.size < 3 && !test.examples.has(run.id)) {
          test.examples.set(run.id, job.html_url);
        }
      }
    }
  }

  const ranked = [...tests.values()].sort(
    (a, b) =>
      b.runs.size - a.runs.size ||
      b.recoveredRuns.size - a.recoveredRuns.size ||
      a.name.localeCompare(b.name) ||
      a.family.localeCompare(b.family) ||
      a.path.localeCompare(b.path),
  );

  return {
    since,
    until,
    runs: runs.length,
    failedJobs,
    failedJobsWithoutTests,
    warnings,
    totalTests: ranked.length,
    tests: ranked.slice(0, MAX_TESTS).map(test => ({
      family: test.family,
      path: test.path,
      name: test.name,
      runs: test.runs.size,
      recoveredRuns: test.recoveredRuns.size,
      examples: [...test.examples.values()],
    })),
  };
}

export function renderReport(report) {
  const lines = [
    '## Top 10 failing tests this week',
    '',
    `Develop CI runs created between ${report.since} and ${report.until}.`,
    '',
    `${report.runs} runs examined, including earlier attempts of runs that eventually passed.`,
    `Showing the ${report.tests.length} most frequent failures out of ${report.totalTests} failing tests.`,
    '',
    'Each test counts once per workflow run, regardless of matrix variants or reruns.',
    'Recovery means the same job passed in a later attempt on the same commit; it does not prove the individual test reran. Recurring failures can also be regressions.',
    '',
  ];

  if (report.tests.length === 0) {
    lines.push('No test failures found in the available annotations.', '');
  } else {
    lines.push(
      '| Test | Job family | Affected runs | Runs with job recovery | Examples |',
      '| --- | --- | ---: | ---: | --- |',
    );
    for (const test of report.tests) {
      const links = test.examples.map((url, index) => `[${index + 1}](${url})`).join(', ');
      lines.push(
        `| ${markdownCell(test.name)} | ${markdownCell(test.family)} | ${test.runs} | ${test.recoveredRuns} | ${links} |`,
      );
    }
  }

  lines.push(
    '',
    '### Coverage',
    '',
    `${report.failedJobs} failed job attempts inspected; ${report.failedJobsWithoutTests} had no recognizable test failure annotations.`,
    'Optional jobs are excluded. Setup failures and tests without annotations are not ranked. Counts are not per-test failure rates.',
    '',
    ...report.warnings.map(warning => `- ${markdownCell(warning)}`),
  );
  return `${lines.join('\n')}\n`;
}

export default async function run({ github, context, core }) {
  const report = await collectReport({ github, context });
  for (const warning of report.warnings) {
    core.warning(warning);
  }
  await core.summary.addRaw(renderReport(report)).write();
  return report;
}
