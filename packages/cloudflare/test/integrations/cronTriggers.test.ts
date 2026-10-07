import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
import type { CronTriggersIntegration, CronTriggersOptions } from '../../src/integrations/cronTriggers';
import { cronTriggersIntegration } from '../../src/integrations/cronTriggers';

function startCheckIn(
  cron: string,
  options?: CronTriggersOptions,
): ReturnType<CronTriggersIntegration['startCheckIn']> {
  return (cronTriggersIntegration(options) as unknown as CronTriggersIntegration).startCheckIn(cron);
}

describe('cronTriggersIntegration', () => {
  let captureCheckInSpy: MockInstance<typeof SentryCore.captureCheckIn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    captureCheckInSpy = vi.spyOn(SentryCore, 'captureCheckIn').mockReturnValue('check-in-id');
  });

  test('captures in_progress and then the final status with a duration', () => {
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

    startCheckIn('30 9 * * MON-FRI', { slug });

    expect(slug).toHaveBeenCalledWith('30 9 * * MON-FRI');
    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: 'weekday-report', status: 'in_progress' },
      { schedule: { type: 'crontab', value: '30 9 * * MON-FRI' } },
    );
  });

  test('sends the monitor settings returned by the slug function', () => {
    startCheckIn('0 0 * * *', { slug: () => ({ slug: 'nightly', checkinMargin: 5, maxRuntime: 30 }) });

    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: 'nightly', status: 'in_progress' },
      { schedule: { type: 'crontab', value: '0 0 * * *' }, checkinMargin: 5, maxRuntime: 30 },
    );
  });

  test('sends no check-ins when the slug function returns undefined', () => {
    expect(startCheckIn('0 0 * * *', { slug: () => undefined })).toBeUndefined();
    expect(captureCheckInSpy).not.toHaveBeenCalled();
  });

  test('sends no check-ins and warns when the slug function throws', () => {
    const warnSpy = vi.spyOn(SentryCore.debug, 'warn').mockImplementation(() => undefined);
    const slug = (): string => {
      throw new Error('slug error');
    };

    expect(startCheckIn('0 0 * * *', { slug })).toBeUndefined();
    expect(captureCheckInSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`slug` threw'), expect.any(Error));
  });

  test('sends no check-ins for a run without a cron expression', () => {
    expect(startCheckIn('')).toBeUndefined();
    expect(captureCheckInSpy).not.toHaveBeenCalled();
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
    startCheckIn(`0 9 * * ${weekdays}`);

    expect(captureCheckInSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }), {
      schedule: { type: 'crontab', value: `0 9 * * ${expected}` },
    });
  });

  test.each([['0'], ['8'], ['6-2'], ['L'], ['6L'], ['6#2'], ['?'], ['1-*'], ['2/0']])(
    'sends check-ins without a schedule for the weekday field %s',
    weekdays => {
      const warnSpy = vi.spyOn(SentryCore.debug, 'warn').mockImplementation(() => undefined);

      startCheckIn(`0 9 * * ${weekdays}`);

      expect(captureCheckInSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }), undefined);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Can't convert"));
    },
  );

  test.each([['15W'], ['LW'], ['?']])('sends check-ins without a schedule for the day of month %s', dayOfMonth => {
    startCheckIn(`0 9 ${dayOfMonth} * *`);

    expect(captureCheckInSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }), undefined);
  });

  test.each([['0 9 1 * MON'], ['0 9 1-7 * 2'], ['0 9 */2 * MON']])(
    'sends check-ins without a schedule when both day fields are set in %s',
    cron => {
      startCheckIn(cron);

      expect(captureCheckInSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }), undefined);
    },
  );

  test('sends check-ins without a schedule for an expression without five fields', () => {
    startCheckIn('0 0 9 * * *');

    expect(captureCheckInSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }), undefined);
  });

  test.each([
    ['0 9 * * 1,5', 'cron-0-9-x-x-1_5'],
    ['0 9 * * 1-5', 'cron-0-9-x-x-1to5'],
    ['0 9 * * 1/5', 'cron-0-9-x-x-1by5'],
    ['*/15 * * * *', 'cron-xby15-x-x-x-x'],
    ['0  9 * * MON', 'cron-0-9-x-x-mon'],
    ['30 9 * * MON-FRI', 'cron-30-9-x-x-montofri'],
  ])('derives the slug for %s as %s', (cron, slug) => {
    startCheckIn(cron);

    expect(captureCheckInSpy).toHaveBeenCalledWith({ monitorSlug: slug, status: 'in_progress' }, expect.anything());
  });

  test('appends a hash to the slug of an expression with other characters', () => {
    startCheckIn('0 9 * * 1#5');

    expect(captureCheckInSpy).toHaveBeenCalledWith(
      { monitorSlug: expect.stringMatching(/^cron-0-9-x-x-1-5-[a-z0-9]{1,6}$/), status: 'in_progress' },
      undefined,
    );
  });

  test('shortens long slugs and appends a hash', () => {
    const slugs: string[] = [];
    captureCheckInSpy.mockImplementation(checkIn => {
      slugs.push(checkIn.monitorSlug);
      return 'check-in-id';
    });
    const minutes = Array.from({ length: 30 }, (_, i) => i).join(',');

    startCheckIn(`${minutes} * * * *`);
    startCheckIn(`${minutes},59 * * * *`);

    expect(slugs).toHaveLength(2);
    expect(slugs[0]).toMatch(/^cron-0_1_2_.*-[a-z0-9]{1,6}$/);
    expect(slugs[0]?.length).toBeLessThanOrEqual(50);
    expect(slugs[1]).not.toBe(slugs[0]);
  });
});
