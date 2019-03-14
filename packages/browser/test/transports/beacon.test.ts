import { expect } from 'chai';
import { SinonStub, stub } from 'sinon';

import { Status, Transports } from '../../src';

const testDsn = 'https://123@sentry.io/42';
const transportUrl = 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7';
const payload = {
  event_id: '1337',
  message: 'Pickle Rick',
  user: {
    username: 'Morty',
  },
};

let sendBeacon: SinonStub;
let transport: Transports.BaseTransport;

describe('BeaconTransport', () => {
  beforeEach(() => {
    // @ts-ignore
    sendBeacon = stub(window.navigator, 'sendBeacon');
    transport = new Transports.BeaconTransport({ dsn: testDsn });
  });

  afterEach(() => {
    sendBeacon.restore();
  });

  it('inherits composeEndpointUrl() implementation', () => {
    expect(transport.url).equal(transportUrl);
  });

  describe('sendEvent()', async () => {
    it('sends a request to Sentry servers', async () => {
      sendBeacon.returns(true);

      return transport.sendEvent(payload).then(res => {
        expect(res.status).equal(Status.Success);
        expect(sendBeacon.calledOnce).equal(true);
        expect(sendBeacon.calledWith(transportUrl, JSON.stringify(payload))).equal(true);
      });
    });

    it('rejects with failed status', async () => {
      sendBeacon.returns(false);

      return transport.sendEvent(payload).catch(res => {
        expect(res.status).equal(Status.Failed);
        expect(sendBeacon.calledOnce).equal(true);
        expect(sendBeacon.calledWith(transportUrl, JSON.stringify(payload))).equal(true);
      });
    });
  });
});
