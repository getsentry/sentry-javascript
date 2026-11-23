import type { MonitorConfig } from '@sentry/core';
import { setCurrentClient } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { beforeSchedule, getMonitorConfig, isOneOffSpec, onSchedule } from '../../src/integrations/node-schedule';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('isOneOffSpec', () => {
  it.each([
    ['a Date', new Date()],
    ['a timestamp', 1_793_527_200_000],
    ['a date string', '2026-11-01T10:00:00Z'],
    ['a long date string', 'Sun Nov 01 2026 10:00:00 GMT+0000'],
    ['a Date rule', { rule: new Date(), tz: 'UTC' }],
  ])('is true for %s', (_, spec) => {
    expect(isOneOffSpec(spec)).toBe(true);
  });

  it.each([
    ['a cron string', '0 9 * * *'],
    ['a cron with names', '0 9 * jan mon-fri'],
    ['a cron with seconds', '*/10 * * * * *'],
    ['a nickname', '@daily'],
    ['a cron rule', { rule: '0 9 * * *', tz: 'UTC' }],
    ['a recurrence rule', { hour: 3, minute: 0 }],
  ])('is false for %s', (_, spec) => {
    expect(isOneOffSpec(spec)).toBe(false);
  });
});

describe('getMonitorConfig', () => {
  it('sends a cron rule with its time zone', () => {
    expect(getMonitorConfig({ rule: '30 9 * * 1-5', tz: 'Europe/Vienna' })).toEqual({
      schedule: { type: 'crontab', value: '30 9 * * 1-5' },
      timezone: 'Europe/Vienna',
    });
  });

  it('drops a fixed second', () => {
    expect(getMonitorConfig({ rule: '0 30 9 * * *', tz: 'UTC' })?.schedule).toEqual({
      type: 'crontab',
      value: '30 9 * * *',
    });
  });

  it.each([
    ['a sub-minute cron', '*/10 * * * * *'],
    ['a rule with a start', { rule: '0 9 * * *', start: Date.now() + 1000 }],
    ['a rule with an end', { rule: '0 9 * * *', end: Date.now() + 1000 }],
    ['a recurrence rule', { hour: 3, minute: 0 }],
    ['a UTC offset', { rule: '0 9 * * *', tz: '+02:00' }],
  ])('is undefined for %s', (_, spec) => {
    expect(getMonitorConfig(spec)).toBeUndefined();
  });
});

describe('job.schedule', () => {
  let sentConfigs: Array<MonitorConfig | undefined>;

  beforeEach(() => {
    sentConfigs = [];
    const client = new TestClient(getDefaultTestClientOptions());
    client.captureCheckIn = (_checkIn, monitorConfig) => {
      sentConfigs.push(monitorConfig);
      return 'check-in-id';
    };
    setCurrentClient(client);
  });

  const createJob = (name = 'my-job') => {
    let pending = false;
    return {
      name,
      job: (() => {}) as unknown,
      nextInvocation: () => (pending ? new Date() : null),
      schedule(spec: unknown) {
        const change = { arguments: [spec], self: this, result: undefined as unknown };
        beforeSchedule(change, { excludeJobs: ['excluded-job'] });
        change.result = spec !== 'not a spec';
        pending ||= change.result === true;
        onSchedule(change);
        return change.result;
      },
      reschedule(spec: unknown) {
        pending = false;
        return this.schedule(spec);
      },
      run() {
        (this.job as () => void)();
      },
    };
  };

  it('sends the schedule of a named job', () => {
    const job = createJob();
    job.schedule({ rule: '30 9 * * 1-5', tz: 'UTC' });
    job.run();

    expect(sentConfigs[0]).toEqual({ schedule: { type: 'crontab', value: '30 9 * * 1-5' }, timezone: 'UTC' });
  });

  it.each([
    ['an unnamed job', createJob('<Anonymous Job 1 2026-10-28T00:00:00.000Z>'), '0 9 * * *'],
    ['an excluded job', createJob('excluded-job'), '0 9 * * *'],
    ['a one-off job', createJob(), new Date(Date.now() + 86_400_000)],
    ['a job with a recurrence rule', createJob(), { hour: 3, minute: 0 }],
  ])('does not monitor %s', (_, job, spec) => {
    job.schedule(spec);
    job.run();

    expect(sentConfigs).toEqual([]);
  });

  it('wraps the job once and sends the new schedule after a reschedule', () => {
    const job = createJob();
    job.schedule('0 9 * * *');
    const wrapped = job.job;
    job.reschedule({ rule: '30 10 * * 1-5', tz: 'UTC' });
    job.run();

    expect(job.job).toBe(wrapped);
    expect(sentConfigs).toHaveLength(2);
    expect(sentConfigs[0]).toEqual({ schedule: { type: 'crontab', value: '30 10 * * 1-5' }, timezone: 'UTC' });
  });

  it('stops checking in after a reschedule to a spec it cannot convert', () => {
    const job = createJob();
    job.schedule('0 9 * * *');
    job.reschedule({ hour: 3, minute: 0 });
    job.run();

    expect(sentConfigs).toEqual([]);
  });

  it('keeps the old schedule when the reschedule fails', () => {
    const job = createJob();
    job.schedule('0 9 * * *');
    job.reschedule('not a spec');
    job.run();

    expect(sentConfigs[0]?.schedule).toEqual({ type: 'crontab', value: '0 9 * * *' });
  });

  it('stops checking in when a second schedule adds to the first', () => {
    const job = createJob();
    job.schedule('0 9 * * *');
    job.schedule('0 18 * * *');
    job.run();

    expect(sentConfigs).toEqual([]);
  });
});
