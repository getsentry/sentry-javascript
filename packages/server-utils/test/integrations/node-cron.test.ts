import { describe, expect, it } from 'vitest';
import { toMonitorConfig } from '../../src/integrations/node-cron';

describe('node-cron toMonitorConfig', () => {
  it.each([
    ['* * * * *', '* * * * *'],
    ['0 30 9 * * 1-5', '30 9 * * 1-5'],
    ['0 9 * jan,Jul mon-fri', '0 9 * 1,7 1-5'],
    ['0 9 * * sunday', '0 9 * * 0'],
    ['0 9 */2 * 1', '0 9 */2 * 1'],
    ['@daily', '0 0 * * *'],
    ['@Weekly', '0 0 * * 0'],
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
