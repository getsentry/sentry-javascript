import { expect } from 'chai';
import { SentryEvent } from '../src';
import { BrowserBackend } from '../src/backend';
import { BaseTransport } from '../src/transports';

class SimpleTransport extends BaseTransport {
  public async send(event: SentryEvent): Promise<Response> {
    return new Response(event.event_id, {
      status: 200,
    });
  }
}

const dsn = 'https://123@sentry.io/42';
const testEvent = {
  event_id: '1337',
  message: 'Pickle Rick',
  user: {
    username: 'Morty',
  },
};

let backend: BrowserBackend;

describe('BrowserBackend', () => {
  describe('sendEvent()', () => {
    it('should throw when no DSN is provided', async () => {
      backend = new BrowserBackend({ dsn });

      try {
        await backend.sendEvent(testEvent);
      } catch (e) {
        expect(e.message).equal('Cannot sendEvent without a valid DSN');
      }
    });

    it('should call send() on provided transport', async () => {
      backend = new BrowserBackend({ dsn, transport: SimpleTransport });
      const status = await backend.sendEvent(testEvent);
      expect(status).equal(200);
    });
  });
});
