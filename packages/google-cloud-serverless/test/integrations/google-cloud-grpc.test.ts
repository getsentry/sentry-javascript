jest.mock('dns');

import * as dns from 'dns';
import { EventEmitter } from 'events';
import { PubSub } from '@google-cloud/pubsub';
import * as http2 from 'http2';
import * as nock from 'nock';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { NodeClient, createTransport, setCurrentClient } from '@sentry/node';
import { googleCloudGrpcIntegration } from '../../src/integrations/google-cloud-grpc';

const spyConnect = jest.spyOn(http2, 'connect');

const mockSpanEnd = jest.fn();
const mockStartInactiveSpan = jest.fn(spanArgs => ({ ...spanArgs }));

jest.mock('@sentry/node', () => {
  return {
    ...jest.requireActual('@sentry/node'),
    startInactiveSpan: (ctx: unknown) => {
      mockStartInactiveSpan(ctx);
      return { end: mockSpanEnd };
    },
  };
});

/** Fake HTTP2 stream */
class FakeStream extends EventEmitter {
  public rstCode: number = 0;
  close() {
    this.emit('end');
    this.emit('close');
  }
  end() {}
  pause() {}
  resume() {}
  write(_data: Buffer, cb: CallableFunction) {
    process.nextTick(cb, null);
  }
}

/** Fake HTTP2 session for GRPC */
class FakeSession extends EventEmitter {
  public socket: EventEmitter = new EventEmitter();
  public request: jest.Mock = jest.fn();
  ping() {}
  mockRequest(fn: (stream: FakeStream) => void): FakeStream {
    const stream = new FakeStream();
    this.request.mockImplementationOnce(() => {
      process.nextTick(fn, stream);
      return stream;
    });
    return stream;
  }
  mockUnaryRequest(responseData: Buffer) {
    this.mockRequest(stream => {
      stream.emit(
        'response',
        { ':status': 200, 'content-type': 'application/grpc', 'content-disposition': 'attachment' },
        4,
      );
      stream.emit('data', responseData);
      stream.emit('trailers', { 'grpc-status': '0', 'content-disposition': 'attachment' });
    });
  }
  close() {
    this.emit('close');
    this.socket.emit('close');
  }
  ref() {}
  unref() {}
}

function mockHttp2Session(): FakeSession {
  const session = new FakeSession();
  spyConnect.mockImplementationOnce(() => {
    process.nextTick(() => session.emit('connect'));
    return session as unknown as http2.ClientHttp2Session;
  });
  return session;
}

describe('GoogleCloudGrpc tracing', () => {
  const mockClient = new NodeClient({
    tracesSampleRate: 1.0,
    integrations: [],
    dsn: 'https://withAWSServices@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
  });

  const integration = googleCloudGrpcIntegration();
  mockClient.addIntegration(integration);

  beforeEach(() => {
    nock('https://www.googleapis.com').post('/oauth2/v4/token').reply(200, []);
    setCurrentClient(mockClient);
    mockSpanEnd.mockClear();
    mockStartInactiveSpan.mockClear();
  });

  afterAll(() => {
    nock.restore();
    spyConnect.mockRestore();
  });

  // We use google cloud pubsub as an example of grpc service for which we can trace requests.
  describe('pubsub', () => {
    // @ts-expect-error see "Why @ts-expect-error" note
    const dnsLookup = dns.lookup as jest.Mock;
    // @ts-expect-error see "Why @ts-expect-error" note
    const resolveTxt = dns.resolveTxt as jest.Mock;
    dnsLookup.mockImplementation((hostname, ...args) => {
      expect(hostname).toEqual('pubsub.googleapis.com');
      process.nextTick(args[args.length - 1], null, [{ address: '0.0.0.0', family: 4 }]);
    });
    resolveTxt.mockImplementation((hostname, cb) => {
      expect(hostname).toEqual('pubsub.googleapis.com');
      process.nextTick(cb, null, []);
    });

    const pubsub = new PubSub({
      credentials: {
        client_email: 'client@email',
        private_key:
          '-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQDzU+jLTzW6154Joezxrd2+5pCNYP0HcaMoYqEyXfNRpkNE7wrQ\nUEG830o4Qcaae2BhqZoujwSW7RkR6h0Fkd0WTR8h5J8rSGNHv/1jJoUUjP9iZ/5S\nFAyIIyEYfDPqtnA4iF1QWO2lXWlEFSuZjwM/8jBmeGzoiw17akNThIw8NwIDAQAB\nAoGATpboVloEAY/IdFX/QGOmfhTb1T3hG3lheBa695iOkO2BRo9qT7PMN6NqxlbA\nPX7ht0lfCfCZS+HSOg4CR50/6WXHMSmwlvcjGuDIDKWjviQTTYE77MlVBQHw9WzY\nPfiRBbtouyPGQtO4rk42zkIILC6exBZ1vKpRPOmTAnxrjCECQQD+56r6hYcS6GNp\nNOWyv0eVFMBX4iNWAsRf9JVVvGDz2rVuhnkNiN73vfffDWvSXkCydL1jFmalgdQD\ngm77UZQHAkEA9F+CauU0aZsJ1SthQ6H0sDQ+eNRUgnz4itnkSC2C20fZ3DaSpCMC\n0go81CcZOhftNO730ILqiS67C3d3rqLqUQJBAP10ROHMmz4Fq7MUUcClyPtHIuk/\nhXskTTZL76DMKmrN8NDxDLSUf38+eJRkt+z4osPOp/E6eN3gdXr32nox50kCQCl8\nhXGMU+eR0IuF/88xkY7Qb8KnmWlFuhQohZ7TSyHbAttl0GNZJkNuRYFm2duI8FZK\nM3wMnbCIZGy/7WuScOECQQCV+0yrf5dL1M2GHjJfwuTb00wRKalKQEH1v/kvE5vS\nFmdN7BPK5Ra50MaecMNoYqu9rmtyWRBn93dcvKrL57nY\n-----END RSA PRIVATE KEY-----\n',
      },
      projectId: 'project-id',
    });  // trufflehog:ignore

    afterEach(() => {
      dnsLookup.mockReset();
      resolveTxt.mockReset();
    });

    afterAll(async () => {
      await pubsub.close();
    });

    test('publish', async () => {
      mockHttp2Session().mockUnaryRequest(Buffer.from('00000000120a1031363337303834313536363233383630', 'hex'));
      const resp = await pubsub.topic('nicetopic').publish(Buffer.from('data'));
      expect(resp).toEqual('1637084156623860');
      expect(mockStartInactiveSpan).toBeCalledWith({
        op: 'grpc.pubsub',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.grpc.serverless',
        },
        name: 'unary call publish',
        onlyIfParent: true,
      });
    });
  });
});
