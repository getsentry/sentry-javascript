import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CronTriggersIntegration, CronTriggersOptions } from '../../src/integrations/cronTriggers';
import { cronTriggersIntegration } from '../../src/integrations/cronTriggers';

function startCheckIn(
  cron: string,
  options?: CronTriggersOptions,
): ReturnType<CronTriggersIntegration['startCheckIn']> {
  return (cronTriggersIntegration(options) as unknown as CronTriggersIntegration).startCheckIn(cron);
}

function getInProgressCheckIn(cron: string, options?: CronTriggersOptions): unknown[] | undefined {
  const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn').mockReturnValue('check-in-id');
  startCheckIn(cron, options);
  const call = captureCheckInSpy.mock.calls[0];
  captureCheckInSpy.mockRestore();
  return call;
}

function getSlug(cron: string): string {
  return (getInProgressCheckIn(cron)?.[0] as { monitorSlug: string }).monitorSlug;
}

describe('cronTriggersIntegration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('captures in_progress and then the final status with a duration', () => {
    const captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn').mockReturnValue('check-in-id');

    const finish = startCheckIn('30 9 * * 1-5');
    finish?.('error');

    expect(captureCheckInSpy).toHaveBeenCalledTimes(2);
    expect(captureCheckInSpy).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'cron-30-9-x-x-1to5', status: 'in_progress' },
      { schedule: { type: 'crontab', value: '30 9 * * SUN-THU' } },
    );
    expect(captureCheckInSpy).toHaveBeenNthCalledWith(2, {
      monitorSlug: 'cron-30-9-x-x-1to5',
      status: 'error',
      checkInId: 'check-in-id',
      duration: expect.any(Number),
    });
  });

  test('uses the slug returned by the slug function', () => {
    const slug = vi.fn().mockReturnValue('weekday-report');

    expect(getInProgressCheckIn('30 9 * * MON-FRI', { slug })).toEqual([
      { monitorSlug: 'weekday-report', status: 'in_progress' },
      { schedule: { type: 'crontab', value: '30 9 * * MON-FRI' } },
    ]);
    expect(slug).toHaveBeenCalledWith('30 9 * * MON-FRI');
  });

  test('sends the monitor settings returned by the slug function', () => {
    const [, monitorConfig] = getInProgressCheckIn('0 0 * * *', {
      slug: () => ({ slug: 'nightly', checkinMargin: 5, maxRuntime: 30 }),
    }) as unknown[];

    expect(monitorConfig).toEqual({
      schedule: { type: 'crontab', value: '0 0 * * *' },
      checkinMargin: 5,
      maxRuntime: 30,
    });
  });

  test('sends no check-ins when the slug function returns undefined', () => {
    expect(getInProgressCheckIn('0 0 * * *', { slug: () => undefined })).toBeUndefined();
    expect(startCheckIn('0 0 * * *', { slug: () => undefined })).toBeUndefined();
  });

  test('sends no check-ins and warns when the slug function throws', () => {
    const warnSpy = vi.spyOn(SentryCore.debug, 'warn').mockImplementation(() => undefined);
    const slug = (): string => {
      throw new Error('slug error');
    };

    expect(getInProgressCheckIn('0 0 * * *', { slug })).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`slug` threw'), expect.any(Error));
  });

  test('sends no check-ins for a run without a cron expression', () => {
    expect(getInProgressCheckIn('')).toBeUndefined();
  });

  test.each([
    ['1', 'SUN'],
    ['7', 'SAT'],
    ['2,4,6', 'MON,WED,FRI'],
    ['2-6', 'MON-FRI'],
    ['1-7/2', 'SUN-SAT/2'],
    ['2/3', 'MON-SAT/3'],
    ['7/1', 'SAT'],
    ['3-3/2', 'TUE'],
    ['*/2', '*/2'],
    ['*', '*'],
    ['mon-fri', 'MON-FRI'],
    ['SAT,1', 'SAT,SUN'],
  ])('converts the weekday field %s to %s', (weekdays, expected) => {
    const [, monitorConfig] = getInProgressCheckIn(`0 9 * * ${weekdays}`) as unknown[];

    expect(monitorConfig).toEqual({ schedule: { type: 'crontab', value: `0 9 * * ${expected}` } });
  });

  test.each([['0'], ['8'], ['6-2'], ['L'], ['6L'], ['6#2'], ['?'], ['1-*'], ['2/0']])(
    'sends check-ins without a schedule for the weekday field %s',
    weekdays => {
      const warnSpy = vi.spyOn(SentryCore.debug, 'warn').mockImplementation(() => undefined);
      const [checkIn, monitorConfig] = getInProgressCheckIn(`0 9 * * ${weekdays}`) as unknown[];

      expect(checkIn).toEqual(expect.objectContaining({ status: 'in_progress' }));
      expect(monitorConfig).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Can't convert"));
    },
  );

  test.each([['15W'], ['LW'], ['?']])('sends check-ins without a schedule for the day of month %s', dayOfMonth => {
    const [, monitorConfig] = getInProgressCheckIn(`0 9 ${dayOfMonth} * *`) as unknown[];

    expect(monitorConfig).toBeUndefined();
  });

  test('sends check-ins without a schedule for an expression without five fields', () => {
    const [, monitorConfig] = getInProgressCheckIn('0 0 9 * * *') as unknown[];

    expect(monitorConfig).toBeUndefined();
  });

  test.each([
    ['0 9 * * 1,5', 'cron-0-9-x-x-1_5'],
    ['0 9 * * 1-5', 'cron-0-9-x-x-1to5'],
    ['*/15 * * * *', 'cron-xby15-x-x-x-x'],
    ['0  9 * * MON', 'cron-0-9-x-x-mon'],
    ['30 9 * * MON-FRI', 'cron-30-9-x-x-montofri'],
  ])('derives the slug for %s as %s', (cron, slug) => {
    expect(getSlug(cron)).toBe(slug);
  });

  test('derives different slugs for expressions that differ only in separators', () => {
    const crons = ['0 9 * * 1,5', '0 9 * * 1-5', '0 9 * * 1/5', '0 9 * * 1#5'];
    const slugs = crons.map(getSlug);

    expect(new Set(slugs).size).toBe(crons.length);
    expect(slugs[3]).toMatch(/^cron-0-9-x-x-1-5-[a-z0-9]{1,6}$/);
  });

  test('shortens long slugs and appends a hash', () => {
    const minutes = Array.from({ length: 30 }, (_, i) => i).join(',');
    const first = getSlug(`${minutes} * * * *`);
    const second = getSlug(`${minutes},59 * * * *`);

    expect(first.length).toBeLessThanOrEqual(50);
    expect(first).toMatch(/^cron-0_1_2_.*-[a-z0-9]{1,6}$/);
    expect(second).not.toBe(first);
  });
});
