/* eslint-disable no-console */
// Lists the tests that passed on retry in Playwright JSON reports.
// Usage: node scripts/ci-report-flaky-tests.mjs <report.json> [<report.json> ...]
// Missing reports are skipped, because a job can fail before its tests run.
// Sets the `flaky` step output to `true` or `false` and adds the flaky tests to the job summary.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function collectFlakyTests(report) {
  const flaky = [];

  function visit(suite, titles) {
    const suiteTitles = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === 'flaky') {
          flaky.push({
            file: spec.file,
            line: spec.line,
            title: [...suiteTitles, spec.title].join(' › '),
            project: test.projectName,
            attempts: test.results?.length ?? 0,
          });
        }
      }
    }
    for (const child of suite.suites ?? []) {
      visit(child, suiteTitles);
    }
  }

  // The top-level suites are files, whose path is already in `spec.file`.
  for (const fileSuite of report.suites ?? []) {
    for (const spec of fileSuite.specs ?? []) {
      visit({ specs: [spec] }, []);
    }
    for (const suite of fileSuite.suites ?? []) {
      visit(suite, []);
    }
  }
  return flaky;
}

export function renderSummary(entries) {
  const lines = ['## Flaky tests', '', 'These tests failed, then passed on retry.', ''];
  for (const { report, tests } of entries) {
    lines.push(`**${report}**`, '');
    for (const test of tests) {
      const project = test.project ? `[${test.project}] ` : '';
      lines.push(`- ${project}\`${test.file}:${test.line}\` › ${test.title} (${test.attempts} attempts)`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function run(reportPaths) {
  const entries = [];
  for (const reportPath of reportPaths) {
    if (!fs.existsSync(reportPath)) {
      console.log(`No report at ${reportPath}.`);
      continue;
    }
    const tests = collectFlakyTests(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
    console.log(`${reportPath}: ${tests.length} flaky tests.`);
    if (tests.length > 0) {
      entries.push({ report: reportPath, tests });
    }
  }

  if (entries.length > 0) {
    const summary = renderSummary(entries);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `flaky=${entries.length > 0}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2));
}
