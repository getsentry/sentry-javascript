import { describe, expect, it } from 'vitest';
import { isReadAlikeByNodeCron3 } from '../../src/integrations/node-cron';

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
