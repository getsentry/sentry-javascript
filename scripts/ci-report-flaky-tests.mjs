/* eslint-disable no-console */
// Lists the tests that passed on retry in Playwright JSON reports.
// Usage: node scripts/ci-report-flaky-tests.mjs <report.json> [<report.json> ...]
// Missing reports are skipped, because a job can fail before its tests run.
// Sets the `flaky` step output to `true` or `false`, adds the flaky tests to the job summary, and adds a warning
// annotation per flaky test, which scripts/weekly-flaky-tests.mjs counts.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// scripts/weekly-flaky-tests.mjs looks for this prefix
export const FLAKY_ANNOTATION_PREFIX = 'Passed on retry: ';

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
            column: spec.column,
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

function escapeProperty(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

function escapeMessage(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * The annotation title repeats the title of Playwright's `github` reporter, so the weekly report can tell which of the
 * reporter's failure annotations belong to a test that passed on retry. The reporter names the file relative to the
 * directory Playwright ran in (the report's directory) and annotates paths relative to the workspace.
 * `rootDir` is the `config.rootDir` of the report, which `spec.file` is relative to.
 */
export function renderAnnotation(test, { rootDir, cwd, workspace }) {
  const file = path.join(rootDir, test.file);
  const project = test.project ? `[${test.project}] › ` : '';
  const title = `${project}${path.relative(cwd, file)}:${test.line}:${test.column} › ${test.title}`;
  return `::warning file=${escapeProperty(path.relative(workspace, file))},line=${test.line},title=${escapeProperty(
    `${FLAKY_ANNOTATION_PREFIX}${title}`,
  )}::${escapeMessage(`${title} failed, then passed on retry (${test.attempts} attempts).`)}`;
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
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const tests = collectFlakyTests(report);
    console.log(`${reportPath}: ${tests.length} flaky tests.`);
    if (tests.length > 0) {
      entries.push({ report: reportPath, tests });
      const cwd = path.dirname(path.resolve(reportPath));
      const options = { rootDir: report.config?.rootDir ?? cwd, cwd, workspace: process.env.GITHUB_WORKSPACE ?? '' };
      for (const test of tests) {
        console.log(renderAnnotation(test, options));
      }
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
