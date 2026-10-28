import type { MonitorConfig } from '@sentry/core';
import { setCurrentClient } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { onSetTime } from '../../src/integrations/cron';
import { cronExpressionToMonitorConfig, wrapScheduledJob } from '../../src/utils/cronMonitoring';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('onSetTime', () => {
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

  const createJob = () => {
    const onTick = wrapScheduledJob(
      () => {},
      'my-job',
      cronExpressionToMonitorConfig('0 9 * * *', 'UTC', 'or'),
      'auto.function.cron',
    );
    return { cronTime: {} as unknown, _callbacks: [onTick], onTick };
  };

  // `setTime` assigns the new `CronTime` before the channel's `end` fires.
  const setTime = (job: ReturnType<typeof createJob>, cronTime: unknown, applied = true): void => {
    if (applied) {
      job.cronTime = cronTime;
    }
    onSetTime({ arguments: [cronTime], self: job });
  };

  it('sends the new schedule after setTime', () => {
    const job = createJob();
    setTime(job, { source: '30 10 * * 1-5', timeZone: 'Europe/Vienna' });
    job.onTick();

    expect(sentConfigs[0]).toEqual({
      schedule: { type: 'crontab', value: '30 10 * * 1-5' },
      timezone: 'Europe/Vienna',
    });
  });

  it.each([
    ['a date', { source: new Date(), timeZone: 'UTC' }],
    ['a UTC offset', { source: '0 9 * * *', utcOffset: 60 }],
    ['a sub-minute cron', { source: '*/10 * * * * *', timeZone: 'UTC' }],
  ])('sends no config after setTime with %s', (_, cronTime) => {
    const job = createJob();
    setTime(job, cronTime);
    job.onTick();

    expect(sentConfigs).toHaveLength(2);
    expect(sentConfigs[0]).toBeUndefined();
  });

  it('keeps the old schedule when setTime throws', () => {
    const job = createJob();
    setTime(job, '30 10 * * *', false);
    job.onTick();

    expect(sentConfigs[0]?.schedule).toEqual({ type: 'crontab', value: '0 9 * * *' });
  });
});
