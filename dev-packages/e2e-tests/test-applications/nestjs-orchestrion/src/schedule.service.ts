import { Injectable } from '@nestjs/common';
import { Cron, Interval, SchedulerRegistry, Timeout } from '@nestjs/schedule';

// Scheduled-handler instrumentation captures errors (no span) under
// `auto.function.nestjs.{cron,interval,timeout}`.
@Injectable()
export class ScheduleService {
  public constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  @Cron('*/5 * * * * *', { name: 'test-cron-error' })
  public handleCronError(): void {
    throw new Error('Test error from cron');
  }

  @Interval('test-interval-error', 2000)
  public handleIntervalError(): void {
    throw new Error('Test error from interval');
  }

  // Long delay so it never fires on its own; the test triggers it via HTTP.
  @Timeout('test-timeout-error', 600000)
  public handleTimeoutError(): void {
    throw new Error('Test error from timeout');
  }

  public killCron(name: string): void {
    this.schedulerRegistry.deleteCronJob(name);
  }

  public killInterval(name: string): void {
    this.schedulerRegistry.deleteInterval(name);
  }
}
