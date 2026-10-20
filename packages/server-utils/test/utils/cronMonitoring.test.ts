import { describe, expect, it } from 'vitest';
import { cronExpressionToMonitorConfig, shouldMonitorJob } from '../../src/utils/cronMonitoring';

const toMonitorConfig = (expression: string, timezone: unknown) =>
  cronExpressionToMonitorConfig(expression, timezone, 'and');

describe('cronExpressionToMonitorConfig with node-cron day matching', () => {
  it.each([
    ['* * * * *', '* * * * *'],
    ['0 30 9 * * 1-5', '30 9 * * 1-5'],
    ['0 9 * jan,Jul mon-fri', '0 9 * 1,7 1-5'],
    ['0 9 * * sunday', '0 9 * * 0'],
    ['0 9 */2 * 1', '0 9 */2 * 1'],
    ['@daily', '0 0 * * *'],
    ['@Weekly', '0 0 * * 0'],
    ['@weekdays', '0 0 * * 1-5'],
    ['*/15 * * * *', '*/15 * * * *'],
  ])('sends %s as %s', (expression, crontab) => {
    expect(toMonitorConfig(expression, 'Europe/Vienna')).toEqual({
      schedule: { type: 'crontab', value: crontab },
      timezone: 'Europe/Vienna',
    });
  });

  it.each([
    '* * * * * *',
    '*/10 * * * * *',
    '0 9 1 * 1',
    '0 9 1-31 * 1',
    '0 9 L * *',
    '0 9 ? * 1',
    '0 9 * * 1#2',
    '* * * *',
    '0 9 * foo *',
  ])('sends no config for %s', expression => {
    expect(toMonitorConfig(expression, 'UTC')).toBeUndefined();
  });

  it('sends no config for fixed UTC offsets', () => {
    expect(toMonitorConfig('* * * * *', 'GMT+5')).toBeUndefined();
    expect(toMonitorConfig('* * * * *', 'Not/AZone')).toBeUndefined();
  });

  it('uses the canonical time zone name', () => {
    expect(toMonitorConfig('* * * * *', 'europe/vienna')?.timezone).toBe('Europe/Vienna');
  });

  it('falls back to the local time zone', () => {
    expect(toMonitorConfig('* * * * *', undefined)?.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('cronExpressionToMonitorConfig with cron-parser day matching', () => {
  it.each([
    ['0 9 1,15 * mon', '0 9 1,15 * 1'],
    ['0 9 */2 * *', '0 9 */2 * *'],
    ['0 9 * * 1-5', '0 9 * * 1-5'],
  ])('sends %s as %s', (expression, crontab) => {
    expect(cronExpressionToMonitorConfig(expression, 'UTC', 'or')?.schedule).toEqual({
      type: 'crontab',
      value: crontab,
    });
  });

  it.each(['0 9 */2 * 1', '0 9 1 * */2', '0 9 1-31 * 1', '0 9 15 * 0-6', '0 9 15 * 1-7'])(
    'sends no config for %s',
    expression => {
      expect(cronExpressionToMonitorConfig(expression, 'UTC', 'or')).toBeUndefined();
    },
  );
});

describe('shouldMonitorJob', () => {
  const job = (): void => {};

  it('monitors named jobs', () => {
    expect(shouldMonitorJob('job', job, undefined)).toBe(true);
  });

  it('skips unnamed jobs and jobs that are not functions', () => {
    expect(shouldMonitorJob(undefined, job, undefined)).toBe(false);
    expect(shouldMonitorJob('', job, undefined)).toBe(false);
    expect(shouldMonitorJob('job', './job.js', undefined)).toBe(false);
  });

  it('skips excluded jobs', () => {
    expect(shouldMonitorJob('job', job, ['job'])).toBe(false);
    expect(shouldMonitorJob('job-2', job, ['job'])).toBe(true);
    expect(shouldMonitorJob('debug-job', job, [/^debug-/])).toBe(false);
  });

  it('skips jobs that `Sentry.cron.instrument*` already monitors', () => {
    const monitored = Object.assign((): void => {}, { [Symbol.for('sentry.cron.monitored')]: true });
    expect(shouldMonitorJob('job', monitored, undefined)).toBe(false);
  });
});
