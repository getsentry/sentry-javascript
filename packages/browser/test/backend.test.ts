import { expect } from 'chai';
import { Status } from '../src';
import { BrowserBackend } from '../src/backend';
import { SimpleTransport } from './mocks/simpletransport';

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
    it('should throw when no Dsn is provided', async () => {
      backend = new BrowserBackend({ dsn });

      try {
        await backend.sendEvent(testEvent);
      } catch (e) {
        expect(e.message).equal('Cannot sendEvent without a valid Dsn');
      }
    });

    it('should call sendEvent() on provided transport', async () => {
      backend = new BrowserBackend({ dsn, transport: SimpleTransport });
      const status = await backend.sendEvent(testEvent);
      expect(status.status).equal(Status.Success);
    });
  });
});
