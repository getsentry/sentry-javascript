jest.mock('dns');

import { PubSub } from '@google-cloud/pubsub';
import * as SentryNode from '@sentry/node';
import * as dns from 'dns';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http2 from 'http2';
import * as nock from 'nock';
import * as path from 'path';

import { GoogleCloudGrpc } from '../src/google-cloud-grpc';

/**
 * Why @ts-ignore some Sentry.X calls
 *
 * A hack-ish way to contain everything related to mocks in the same __mocks__ file.
 * Thanks to this, we don't have to do more magic than necessary. Just add and export desired method and assert on it.
 */

const spyConnect = jest.spyOn(http2, 'connect');

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
  beforeAll(() => {
    new GoogleCloudGrpc().setupOnce();
  });

  beforeEach(() => {
    nock('https://www.googleapis.com').post('/oauth2/v4/token').reply(200, []);
  });
  afterEach(() => {
    // @ts-ignore see "Why @ts-ignore" note
    SentryNode.resetMocks();
    spyConnect.mockClear();
  });
  afterAll(() => {
    nock.restore();
    spyConnect.mockRestore();
  });

  // We use google cloud pubsub as an example of grpc service for which we can trace requests.
  describe('pubsub', () => {
    // @ts-ignore see "Why @ts-ignore" note
    const dnsLookup = dns.lookup as jest.Mock;
    // @ts-ignore see "Why @ts-ignore" note
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
        private_key: fs.readFileSync(path.resolve(__dirname, 'private.pem')).toString(),
      },
      projectId: 'project-id',
    });

    afterEach(() => {
      dnsLookup.mockReset();
      resolveTxt.mockReset();
    });

    test('publish', async () => {
      mockHttp2Session().mockUnaryRequest(Buffer.from('00000000120a1031363337303834313536363233383630', 'hex'));
      const resp = await pubsub.topic('nicetopic').publish(Buffer.from('data'));
      expect(resp).toEqual('1637084156623860');
      // @ts-ignore see "Why @ts-ignore" note
      expect(SentryNode.fakeTransaction.startChild).toBeCalledWith({
        op: 'grpc.pubsub',
        origin: 'auto.grpc.serverless',
        description: 'unary call publish',
      });
      await pubsub.close();
    });
  });
});
