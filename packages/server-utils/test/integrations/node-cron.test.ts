import { describe, expect, it } from 'vitest';
import { getMonitorConfig, isReadAlikeByNodeCron3, isReadAlikeByNodeCron4 } from '../../src/integrations/node-cron';

describe('isReadAlikeByNodeCron3', () => {
  it.each(['* * * * *', '*/15 * * * *', '0 */2 * * *', '0 8-18/2 * * *', '0 0 9 * * 1-5', '0 9 * * 7', '0 9 * * 0,7'])(
    'is true for %s',
    expression => {
      expect(isReadAlikeByNodeCron3(expression)).toBe(true);
    },
  );

  // node-cron 3 runs these on 2,4,...; 10,12,...; 3,6,...; Sunday-Monday; and every day but Saturday.
  it.each([
    '0 9 */2 * *',
    '0 9-17/2 * * *',
    '0 9 * */3 *',
    '0 9 * * 1-7',
    '0 9 * * 5-7',
    '0 9 * * sat-sun',
    '0 9 * * 6-0',
    '0 9 * * fri-Sun',
    '5/15 * * * *',
    '0,30/15 * * * *',
  ])('is false for %s', expression => {
    expect(isReadAlikeByNodeCron3(expression)).toBe(false);
  });
});

describe('isReadAlikeByNodeCron4', () => {
  it.each(['* * * * *', '0 9 * * 1-5', '0 9 * * sun-tue', '0 9 * * 0,7', '0 9 */2 * *', '0 22-2 * * *'])(
    'is true for %s',
    expression => {
      expect(isReadAlikeByNodeCron4(expression)).toBe(true);
    },
  );

  it.each(['0 9 * * sat-sun', '0 9 * * 6-0', '0 9 * * 6-7', '0 9 * * 5-0/2', '0 9 * * 1-3,sat-sun'])(
    'is false for %s',
    expression => {
      expect(isReadAlikeByNodeCron4(expression)).toBe(false);
    },
  );
});

describe('getMonitorConfig', () => {
  // node-cron 4.6 runs these on the weekend; earlier versions run them every day.
  it.each(['0 9 * * sat-sun', '0 9 * * 6-0'])('sends %s as 6-7 for node-cron 4.6', expression => {
    expect(getMonitorConfig(expression, 'UTC')?.schedule).toEqual({ type: 'crontab', value: '0 9 * * 6-7' });
  });

  it.each(['0 9 * * sat-sun', '0 9 * * 6-0'])('sends no config for %s before node-cron 4.6', expression => {
    expect(getMonitorConfig(expression, 'UTC', isReadAlikeByNodeCron4)).toBeUndefined();
  });

  it('sends no config for a reversed hour range', () => {
    expect(getMonitorConfig('0 22-2 * * *', 'UTC')).toBeUndefined();
    expect(getMonitorConfig('0 22-2 * * *', 'UTC', isReadAlikeByNodeCron4)).toBeUndefined();
  });

  it('sends the config for other ranges before node-cron 4.6', () => {
    expect(getMonitorConfig('0 9 * * mon-fri', 'UTC', isReadAlikeByNodeCron4)?.schedule).toEqual({
      type: 'crontab',
      value: '0 9 * * 1-5',
    });
  });
});
