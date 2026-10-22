import { describe, expect, it } from 'vitest';
import { collectFlakyTests, renderSummary } from './ci-report-flaky-tests.mjs';

// The shape of a Playwright 1.64 JSON report, trimmed to the fields the script reads
const report = {
  suites: [
    {
      title: 'a.test.ts',
      file: 'a.test.ts',
      specs: [
        {
          title: 'top-level flaky',
          file: 'a.test.ts',
          line: 8,
          tests: [{ projectName: 'chromium', status: 'flaky', results: [{}, {}] }],
        },
        {
          title: 'hard fail',
          file: 'a.test.ts',
          line: 9,
          tests: [{ projectName: 'chromium', status: 'unexpected', results: [{}, {}] }],
        },
      ],
      suites: [
        {
          title: 'outer',
          file: 'a.test.ts',
          specs: [
            {
              title: 'always passes',
              file: 'a.test.ts',
              line: 6,
              tests: [{ projectName: 'chromium', status: 'expected', results: [{}] }],
            },
          ],
          suites: [
            {
              title: 'inner',
              file: 'a.test.ts',
              specs: [
                {
                  title: 'flaky one',
                  file: 'a.test.ts',
                  line: 4,
                  tests: [
                    { projectName: 'chromium', status: 'flaky', results: [{}, {}] },
                    { projectName: 'webkit', status: 'expected', results: [{}] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('collectFlakyTests', () => {
  it('returns only the tests that passed on retry, with their describe titles', () => {
    expect(collectFlakyTests(report)).toEqual([
      { file: 'a.test.ts', line: 8, title: 'top-level flaky', project: 'chromium', attempts: 2 },
      { file: 'a.test.ts', line: 4, title: 'outer › inner › flaky one', project: 'chromium', attempts: 2 },
    ]);
  });

  it('returns nothing for a report without suites', () => {
    expect(collectFlakyTests({})).toEqual([]);
  });
});

describe('renderSummary', () => {
  it('lists the flaky tests per report', () => {
    expect(renderSummary([{ report: 'results.json', tests: collectFlakyTests(report) }])).toBe(
      [
        '## Flaky tests',
        '',
        'These tests failed, then passed on retry.',
        '',
        '**results.json**',
        '',
        '- [chromium] `a.test.ts:8` › top-level flaky (2 attempts)',
        '- [chromium] `a.test.ts:4` › outer › inner › flaky one (2 attempts)',
        '',
        '',
      ].join('\n'),
    );
  });
});
