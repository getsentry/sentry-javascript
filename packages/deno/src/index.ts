import { BaseClient, createTransport, getCurrentHub, initAndBind } from '@sentry/core';

import { ClientOptions, Event, SeverityLevel } from '@sentry/types';

function makeDenoTransport(options: any) {
  function makeRequest(request: any) {
    const req = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'origin',
      headers: options.headers,
      ...options.fetchOptions,
    };

    console.log(req);

    return fetch(options.url, req).then(response => ({
      statusCode: response.status,
    }));
  }

  return createTransport(options, makeRequest);
}

interface DenoClientOptions extends ClientOptions {}

class DenoClient extends BaseClient<DenoClientOptions> {
  public eventFromException(exception: any): PromiseLike<Event> {
    const event: Event = {
      exception: {
        values: [
          {
            type: exception.name,
            value: exception.message,
          },
        ],
      },
    };

    return Promise.resolve(event);
  }

  public eventFromMessage(message: string, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return Promise.resolve({ message, level });
  }
}

export { DenoClient, getCurrentHub, initAndBind, makeDenoTransport };
export type { DenoClientOptions };
