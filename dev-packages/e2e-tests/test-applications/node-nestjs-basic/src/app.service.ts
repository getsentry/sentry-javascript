import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { SentryCron, SentryTraced } from '@sentry/nestjs';
import type { MonitorConfig } from '@sentry/types';

const monitorConfig: MonitorConfig = {
  schedule: {
    type: 'crontab',
    value: '* * * * *',
  },
};

@Injectable()
export class AppService {
  constructor(private schedulerRegistry: SchedulerRegistry) {}

  testTransaction() {
    Sentry.startSpan({ name: 'test-span' }, () => {
      Sentry.startSpan({ name: 'child-span' }, () => {});
    });
  }

  testException(id: string) {
    throw new Error(`This is an exception with id ${id}`);
  }

  testExpectedException(id: string) {
    throw new HttpException(`This is an expected exception with id ${id}`, HttpStatus.FORBIDDEN);
  }

  @SentryTraced('wait and return a string')
  async wait() {
    await new Promise(resolve => setTimeout(resolve, 500));
    return 'test';
  }

  async testSpanDecoratorAsync() {
    return await this.wait();
  }

  @SentryTraced('return a string')
  getString(): { result: string } {
    return { result: 'test' };
  }

  async testSpanDecoratorSync() {
    const returned = this.getString();
    // Will fail if getString() is async, because returned will be a Promise<>
    return returned.result;
  }

  /*
  Actual cron schedule differs from schedule defined in config because Sentry
  only supports minute granularity, but we don't want to wait (worst case) a
  full minute for the tests to finish.
  */
  @Cron('*/5 * * * * *', { name: 'test-cron-job' })
  @SentryCron('test-cron-slug', monitorConfig)
  async testCron() {
    console.log('Test cron!');
  }

  async killTestCron() {
    this.schedulerRegistry.deleteCronJob('test-cron-job');
  }
}
