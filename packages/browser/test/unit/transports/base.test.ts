import { Outcome } from '@sentry/types';

import { BaseTransport } from '../../../src/transports/base';

const testDsn = 'https://123@sentry.io/42';
const envelopeEndpoint = 'https://sentry.io/api/42/envelope/?sentry_key=123&sentry_version=7';

class SimpleTransport extends BaseTransport {}

describe('BaseTransport', () => {
  describe('Client Reports', () => {
    const sendBeaconSpy = jest.fn();
    let visibilityState: string;

    beforeAll(() => {
      navigator.sendBeacon = sendBeaconSpy;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: function() {
          return visibilityState;
        },
      });
      jest.spyOn(Date, 'now').mockImplementation(() => 12345);
    });

    beforeEach(() => {
      sendBeaconSpy.mockClear();
    });

    it('attaches visibilitychange handler if sendClientReport is set to true', () => {
      const eventListenerSpy = jest.spyOn(document, 'addEventListener');
      new SimpleTransport({ dsn: testDsn, sendClientReports: true });
      expect(eventListenerSpy.mock.calls[0][0]).toBe('visibilitychange');
      eventListenerSpy.mockRestore();
    });

    it('doesnt attach visibilitychange handler if sendClientReport is set to false', () => {
      const eventListenerSpy = jest.spyOn(document, 'addEventListener');
      new SimpleTransport({ dsn: testDsn, sendClientReports: false });
      expect(eventListenerSpy).not.toHaveBeenCalled();
      eventListenerSpy.mockRestore();
    });

    it('sends beacon request when there are outcomes captured and visibility changed to `hidden`', () => {
      const transport = new SimpleTransport({ dsn: testDsn, sendClientReports: true });

      transport.recordLostEvent(Outcome.BeforeSend, 'event');

      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));

      const outcomes = [{ reason: Outcome.BeforeSend, category: 'error', quantity: 1 }];

      expect(sendBeaconSpy).toHaveBeenCalledWith(
        envelopeEndpoint,
        `{}\n{"type":"client_report"}\n{"timestamp":12.345,"discarded_events":${JSON.stringify(outcomes)}}`,
      );
    });

    it('doesnt send beacon request when there are outcomes captured, but visibility state did not change to `hidden`', () => {
      const transport = new SimpleTransport({ dsn: testDsn, sendClientReports: true });
      transport.recordLostEvent(Outcome.BeforeSend, 'event');

      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));

      expect(sendBeaconSpy).not.toHaveBeenCalled();
    });

    it('correctly serializes request with different categories/reasons pairs', () => {
      const transport = new SimpleTransport({ dsn: testDsn, sendClientReports: true });

      transport.recordLostEvent(Outcome.BeforeSend, 'event');
      transport.recordLostEvent(Outcome.BeforeSend, 'event');
      transport.recordLostEvent(Outcome.SampleRate, 'transaction');
      transport.recordLostEvent(Outcome.NetworkError, 'session');
      transport.recordLostEvent(Outcome.NetworkError, 'session');
      transport.recordLostEvent(Outcome.RateLimitBackoff, 'event');

      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));

      const outcomes = [
        { reason: Outcome.BeforeSend, category: 'error', quantity: 2 },
        { reason: Outcome.SampleRate, category: 'transaction', quantity: 1 },
        { reason: Outcome.NetworkError, category: 'session', quantity: 2 },
        { reason: Outcome.RateLimitBackoff, category: 'error', quantity: 1 },
      ];

      expect(sendBeaconSpy).toHaveBeenCalledWith(
        envelopeEndpoint,
        `{}\n{"type":"client_report"}\n{"timestamp":12.345,"discarded_events":${JSON.stringify(outcomes)}}`,
      );
    });
  });

  it('doesnt provide sendEvent() implementation', () => {
    const transport = new SimpleTransport({ dsn: testDsn });

    try {
      void transport.sendEvent({});
    } catch (e) {
      expect(e.message).toBe('Transport Class has to implement `sendEvent` method');
    }
  });

  it('has correct endpoint url', () => {
    const transport = new SimpleTransport({ dsn: testDsn });
    // eslint-disable-next-line deprecation/deprecation
    expect(transport.url).toBe('https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7');
  });
});
