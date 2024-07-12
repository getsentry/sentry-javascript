import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import { SentryCron, SentryTraced } from '@sentry/nestjs';
import type { MonitorConfig } from '@sentry/types';
import { makeHttpRequest } from './utils';

const monitorConfig: MonitorConfig = {
  schedule: {
    type: 'crontab',
    value: '* * * * *',
  },
};

@Injectable()
export class AppService1 {
  constructor(private schedulerRegistry: SchedulerRegistry) {}

  testSuccess() {
    return { version: 'v1' };
  }

  testParam(id: string) {
    return {
      paramWas: id,
    };
  }

  testInboundHeaders(headers: Record<string, string>, id: string) {
    return {
      headers,
      id,
    };
  }

  async testOutgoingHttp(id: string) {
    const data = await makeHttpRequest(`http://localhost:3030/test-inbound-headers/${id}`);

    return data;
  }

  async testOutgoingFetch(id: string) {
    const response = await fetch(`http://localhost:3030/test-inbound-headers/${id}`);
    const data = await response.json();

    return data;
  }

  testTransaction() {
    Sentry.startSpan({ name: 'test-span' }, () => {
      Sentry.startSpan({ name: 'child-span' }, () => {});
    });
  }

  async testError() {
    const exceptionId = Sentry.captureException(new Error('This is an error'));

    await Sentry.flush(2000);

    return { exceptionId };
  }

  testException(id: string) {
    throw new Error(`This is an exception with id ${id}`);
  }

  testExpectedException(id: string) {
    throw new HttpException(`This is an expected exception with id ${id}`, HttpStatus.FORBIDDEN);
  }

  async testOutgoingFetchExternalAllowed() {
    const fetchResponse = await fetch('http://localhost:3040/external-allowed');

    return fetchResponse.json();
  }

  async testOutgoingFetchExternalDisallowed() {
    const fetchResponse = await fetch('http://localhost:3040/external-disallowed');

    return fetchResponse.json();
  }

  async testOutgoingHttpExternalAllowed() {
    return makeHttpRequest('http://localhost:3040/external-allowed');
  }

  async testOutgoingHttpExternalDisallowed() {
    return makeHttpRequest('http://localhost:3040/external-disallowed');
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

@Injectable()
export class AppService2 {
  externalAllowed(headers: Record<string, string>) {
    return {
      headers,
      route: 'external-allowed',
    };
  }

  externalDisallowed(headers: Record<string, string>) {
    return {
      headers,
      route: 'external-disallowed',
    };
  }
}
