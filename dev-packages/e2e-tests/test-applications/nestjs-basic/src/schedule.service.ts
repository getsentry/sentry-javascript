import { Injectable } from '@nestjs/common';
import { Cron, Interval, SchedulerRegistry, Timeout } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class ScheduleService {
  constructor(private schedulerRegistry: SchedulerRegistry) {}

  // --- @Cron error test (auto-instrumentation, no @SentryCron) ---
  @Cron('*/5 * * * * *', { name: 'test-schedule-cron-error' })
  handleCronError() {
    throw new Error('Test error from schedule cron');
  }

  // --- @Interval error test ---
  @Interval('test-schedule-interval-error', 2000)
  async handleIntervalError() {
    throw new Error('Test error from schedule interval');
  }

  // --- @Timeout error test ---
  // Use a very long delay so this doesn't fire on its own during tests.
  // The test triggers the method via an HTTP endpoint instead.
  @Timeout('test-schedule-timeout-error', 60000)
  async handleTimeoutError() {
    throw new Error('Test error from schedule timeout');
  }

  // --- Isolation scope test: adds breadcrumb that should NOT leak to HTTP requests ---
  @Interval('test-schedule-isolation', 2000)
  handleIsolationBreadcrumb() {
    Sentry.addBreadcrumb({
      message: 'leaked-breadcrumb-from-schedule',
      level: 'info',
    });
  }

  killCron(name: string) {
    this.schedulerRegistry.deleteCronJob(name);
  }

  killInterval(name: string) {
    this.schedulerRegistry.deleteInterval(name);
  }
}
