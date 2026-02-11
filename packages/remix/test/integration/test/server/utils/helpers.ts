import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import { createRequestHandler } from '@remix-run/express';
import { debug } from '@sentry/core';
import type { EnvelopeItemType, Event, TransactionEvent } from '@sentry/core';
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as Sentry from '@sentry/node';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import express from 'express';
import type { Express } from 'express';
import type { HttpTerminator } from 'http-terminator';
import { createHttpTerminator } from 'http-terminator';
import nock from 'nock';

type DataCollectorOptions = {
  // Optional custom URL
  url?: string;

  // The expected amount of requests to the envelope endpoint.
  // If the amount of sent requests is lower than `count`, this function will not resolve.
  count?: number;

  // The method of the request.
  method?: 'get' | 'post';

  // Whether to stop the server after the requests have been intercepted
  endServer?: boolean;

  // Type(s) of the envelopes to capture
  envelopeType?: EnvelopeItemType | EnvelopeItemType[];
};

async function makeRequest(
  method: 'get' | 'post' = 'get',
  url: string,
  axiosConfig?: AxiosRequestConfig,
): Promise<void> {
  try {
    if (method === 'get') {
      await axios.get(url, axiosConfig);
    } else {
      await axios.post(url, axiosConfig);
    }
  } catch (e) {
    // We sometimes expect the request to fail, but not the test.
    // So, we do nothing.
    debug.warn(e);
  }
}

class TestEnv {
  private _axiosConfig: AxiosRequestConfig | undefined = undefined;
  private _terminator: HttpTerminator;

  public constructor(
    public readonly server: http.Server,
    public readonly url: string,
  ) {
    this.server = server;
    this.url = url;
    this._terminator = createHttpTerminator({ server: this.server, gracefulTerminationTimeout: 0 });
  }

  /**
   * Starts a test server and returns the TestEnv instance
   *
   * @param {string} testDir
   * @param {string} [serverPath]
   * @param {string} [scenarioPath]
   * @return {*}  {Promise<string>}
   */
  public static async init(testDir: string, serverPath?: string, scenarioPath?: string): Promise<TestEnv> {
    const defaultServerPath = path.resolve(process.cwd(), 'utils', 'defaults', 'server');

    const [server, url] = await new Promise<[http.Server, string]>(async resolve => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
      const { default: app } = (await import(serverPath || defaultServerPath)) as { default: Express };

      app.get('/test', async (_req, res) => {
        try {
          await import(scenarioPath || `${testDir}/scenario`);
        } finally {
          res.status(200).end();
        }
      });

      const server = app.listen(0, () => {
        const url = `http://localhost:${(server.address() as AddressInfo).port}/test`;
        resolve([server, url]);
      });
    });

    return new TestEnv(server, url);
  }

  /**
   * Intercepts and extracts up to a number of requests containing Sentry envelopes.
   *
   * @param {DataCollectorOptions} options
   * @returns The intercepted envelopes.
   */
  public async getMultipleEnvelopeRequest(options: DataCollectorOptions): Promise<Record<string, unknown>[][]> {
    const envelopeTypeArray =
      typeof options.envelopeType === 'string'
        ? [options.envelopeType]
        : options.envelopeType || (['event'] as EnvelopeItemType[]);

    const resProm = this.setupNock(
      options.count || 1,
      typeof options.endServer === 'undefined' ? true : options.endServer,
      envelopeTypeArray,
    );

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    makeRequest(options.method, options.url || this.url, this._axiosConfig);
    return resProm;
  }

  /**
   * Intercepts and extracts a single request containing a Sentry envelope
   *
   * @param {DataCollectorOptions} options
   * @returns The extracted envelope.
   */
  public async getEnvelopeRequest(options?: DataCollectorOptions): Promise<Array<Record<string, unknown>>> {
    const requests = await this.getMultipleEnvelopeRequest({ ...options, count: 1 });

    if (!requests[0]) {
      throw new Error('No requests found');
    }

    return requests[0];
  }

  /**
   * Sends a get request to given URL, with optional headers. Returns the response.
   * Ends the server instance and flushes the Sentry event queue.
   *
   * @param {Record<string, string>} [headers]
   * @return {*}  {Promise<any>}
   */
  public async getAPIResponse(
    url?: string,
    headers: Record<string, string> = {},
    endServer: boolean = true,
  ): Promise<unknown> {
    try {
      const { data } = await axios.get(url || this.url, {
        headers,
        // KeepAlive false to work around a Node 20 bug with ECONNRESET: https://github.com/axios/axios/issues/5929
        httpAgent: new http.Agent({ keepAlive: false }),
      });
      return data;
    } finally {
      await Sentry.flush();

      if (endServer) {
        this.server.close();
      }
    }
  }

  public async setupNock(
    count: number,
    endServer: boolean,
    envelopeType: EnvelopeItemType[],
  ): Promise<Record<string, unknown>[][]> {
    return new Promise(resolve => {
      const envelopes: Record<string, unknown>[][] = [];
      const mock = nock('https://dsn.ingest.sentry.io')
        .persist()
        .post('/api/1337/envelope/', body => {
          const envelope = parseEnvelope(body);

          if (envelopeType.includes(envelope[1]?.type as EnvelopeItemType)) {
            envelopes.push(envelope);
          } else {
            return false;
          }

          if (count === envelopes.length) {
            nock.removeInterceptor(mock);

            if (endServer) {
              // Cleaning nock only before the server is closed,
              // not to break tests that use simultaneous requests to the server.
              // Ex: Remix scope bleed tests.
              nock.cleanAll();

              // Abort all pending requests to nock to prevent hanging / flakes.
              // See: https://github.com/nock/nock/issues/1118#issuecomment-544126948
              nock.abortPendingRequests();

              this._closeServer()
                .catch(e => {
                  debug.warn(e);
                })
                .finally(() => {
                  resolve(envelopes);
                });
            } else {
              resolve(envelopes);
            }
          }

          return true;
        });

      mock
        .query(true) // accept any query params - used for sentry_key param
        .reply(200);
    });
  }

  public setAxiosConfig(axiosConfig: AxiosRequestConfig): void {
    this._axiosConfig = axiosConfig;
  }

  public async countEnvelopes(options: {
    url?: string;
    timeout?: number;
    envelopeType: EnvelopeItemType | EnvelopeItemType[];
  }): Promise<number> {
    return new Promise(resolve => {
      let reqCount = 0;

      const mock = nock('https://dsn.ingest.sentry.io')
        .persist()
        .post('/api/1337/envelope/', body => {
          const envelope = parseEnvelope(body);

          if (options.envelopeType.includes(envelope[1]?.type as EnvelopeItemType)) {
            reqCount++;
            return true;
          }

          return false;
        });

      setTimeout(() => {
        nock.removeInterceptor(mock);

        nock.cleanAll();

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._closeServer().then(() => {
          resolve(reqCount);
        });
      }, options.timeout || 1000);
    });
  }

  private _closeServer(): Promise<void> {
    return this._terminator.terminate();
  }
}

export class RemixTestEnv extends TestEnv {
  private constructor(
    public readonly server: http.Server,
    public readonly url: string,
  ) {
    super(server, url);
  }

  public static async init(): Promise<RemixTestEnv> {
    let serverPort;
    const server = await new Promise<http.Server>(async resolve => {
      const app = express();

      // Vite builds to build/server/index.js instead of build/index.js
      app.all('*', createRequestHandler({ build: await import('../../../build/server/index.js') }));

      const server = app.listen(0, () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve(server);
      });
    });

    return new RemixTestEnv(server, `http://localhost:${serverPort}`);
  }
}

const parseEnvelope = (body: string): Array<Record<string, unknown>> => {
  return body.split('\n').map(e => JSON.parse(e));
};

/**
 * Asserts against a Sentry Event ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryEvent = (actual: Event, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    ...expected,
  });
};

/**
 * Asserts against a Sentry Transaction ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryTransaction = (actual: TransactionEvent, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.anything(),
    start_timestamp: expect.anything(),
    spans: expect.any(Array),
    type: 'transaction',
    ...expected,
  });
};
