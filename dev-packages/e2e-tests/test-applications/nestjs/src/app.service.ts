import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { makeHttpRequest } from './utils';

@Injectable()
export class AppService1 {
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

  @SentryTraced('wait function')
  async wait() {
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  async testSpanDecoratorAsync() {
    await this.wait();
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
