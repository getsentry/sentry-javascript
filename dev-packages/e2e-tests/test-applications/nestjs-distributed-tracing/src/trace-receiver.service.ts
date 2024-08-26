import { Injectable } from '@nestjs/common';

@Injectable()
export class TraceReceiverService {
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
