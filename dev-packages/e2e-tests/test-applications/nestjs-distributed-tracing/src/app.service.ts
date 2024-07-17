import { Injectable } from '@nestjs/common';
import { makeHttpRequest } from './utils';

@Injectable()
export class AppService1 {
  constructor() {}

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
