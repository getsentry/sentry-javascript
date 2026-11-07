import { describe, expect, it } from 'vitest';
import { createReport, formatReport } from '../../src/rewriter/report';

describe('formatReport', () => {
  it('is undefined when nothing was skipped', () => {
    const report = createReport();
    report.wrapped.push('a');
    expect(formatReport(report, '/app/a.ts')).toBeUndefined();
  });

  it('names the skipped sites and the module', () => {
    const report = createReport();
    report.skipped.push('requestMiddleware', 'functionMiddleware');
    expect(formatReport(report, '/app/start.ts')).toBe(
      '[Sentry] Could not auto-instrument requestMiddleware and functionMiddleware in /app/start.ts.',
    );
  });
});
