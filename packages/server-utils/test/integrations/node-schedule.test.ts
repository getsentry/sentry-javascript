import type { MonitorConfig } from '@sentry/core';
import { setCurrentClient } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { getMonitorConfig, isOneOffSpec, onReschedule } from '../../src/integrations/node-schedule';
import { wrapScheduledJob } from '../../src/utils/cronMonitoring';
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

describe('onReschedule', () => {
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

  const createJob = () => ({
    job: wrapScheduledJob(() => {}, 'my-job', getMonitorConfig('0 9 * * *'), 'auto.function.node-schedule'),
  });

  it('sends the new schedule after a reschedule', () => {
    const job = createJob();
    onReschedule({ arguments: [{ rule: '30 10 * * 1-5', tz: 'UTC' }], self: job, result: true });
    job.job();

    expect(sentConfigs[0]).toEqual({ schedule: { type: 'crontab', value: '30 10 * * 1-5' }, timezone: 'UTC' });
  });

  it('sends no config after a reschedule to a spec it cannot convert', () => {
    const job = createJob();
    onReschedule({ arguments: [{ hour: 3, minute: 0 }], self: job, result: true });
    job.job();

    expect(sentConfigs).toHaveLength(2);
    expect(sentConfigs[0]).toBeUndefined();
  });

  it('keeps the old schedule when the reschedule fails', () => {
    const job = createJob();
    onReschedule({ arguments: ['not a spec'], self: job, result: false });
    job.job();

    expect(sentConfigs[0]?.schedule).toEqual({ type: 'crontab', value: '0 9 * * *' });
  });
});
