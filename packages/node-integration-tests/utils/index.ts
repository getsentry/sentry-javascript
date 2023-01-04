/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as Sentry from '@sentry/node';
import type { EnvelopeItemType } from '@sentry/types';
import { logger, parseSemver } from '@sentry/utils';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import type { Express } from 'express';
import type * as http from 'http';
import type { AddressInfo } from 'net';
import nock from 'nock';
import * as path from 'path';

export type TestServerConfig = {
  url: string;
  server: http.Server;
};

export type DataCollectorOptions = {
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

/**
 * Returns`describe` or `describe.skip` depending on allowed major versions of Node.
 *
 * @param {{ min?: number; max?: number }} allowedVersion
 * @return {*}  {jest.Describe}
 */
export const conditionalTest = (allowedVersion: { min?: number; max?: number }): jest.Describe => {
  const NODE_VERSION = parseSemver(process.versions.node).major;
  if (!NODE_VERSION) {
    return describe.skip;
  }

  return NODE_VERSION < (allowedVersion.min || -Infinity) || NODE_VERSION > (allowedVersion.max || Infinity)
    ? describe.skip
    : describe;
};

/**
 * Asserts against a Sentry Event ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryEvent = (actual: Record<string, unknown>, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.anything(),
    ...expected,
  });
};

/**
 * Asserts against a Sentry Transaction ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryTransaction = (actual: Record<string, unknown>, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.anything(),
    start_timestamp: expect.anything(),
    spans: expect.any(Array),
    type: 'transaction',
    ...expected,
  });
};

/**
 * Parses response body containing an Envelope
 *
 * @param {string} body
 * @return {*}  {Array<Record<string, unknown>>}
 */
export const parseEnvelope = (body: string): Array<Record<string, unknown>> => {
  return body.split('\n').map(e => JSON.parse(e));
};

/**
 * Sends a get request to given URL.
 * Flushes the Sentry event queue.
 *
 * @param {string} url
 * @return {*}  {Promise<void>}
 */
export async function runScenario(url: string): Promise<void> {
  await axios.get(url);
  await Sentry.flush();
}

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
    logger.warn(e);
  }
}

export class TestEnv {
  private _axiosConfig: AxiosRequestConfig | undefined = undefined;

  public constructor(public readonly server: http.Server, public readonly url: string) {
    this.server = server;
    this.url = url;
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

    const [server, url] = await new Promise<[http.Server, string]>(resolve => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
      const app = require(serverPath || defaultServerPath).default as Express;

      app.get('/test', (_req, res) => {
        try {
          require(scenarioPath || `${testDir}/scenario`);
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

    void makeRequest(options.method, options.url || this.url, this._axiosConfig);
    return resProm;
  }

  /**
   * Intercepts and extracts a single request containing a Sentry envelope
   *
   * @param {DataCollectorOptions} options
   * @returns The extracted envelope.
   */
  public async getEnvelopeRequest(options?: DataCollectorOptions): Promise<Array<Record<string, unknown>>> {
    return (await this.getMultipleEnvelopeRequest({ ...options, count: 1 }))[0];
  }

  /**
   * Sends a get request to given URL, with optional headers. Returns the response.
   * Ends the server instance and flushes the Sentry event queue.
   *
   * @param {Record<string, string>} [headers]
   * @return {*}  {Promise<any>}
   */
  public async getAPIResponse(url?: string, headers?: Record<string, string>): Promise<unknown> {
    try {
      const { data } = await axios.get(url || this.url, { headers: headers || {} });
      return data;
    } finally {
      await Sentry.flush();
      this.server.close();
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

          if (envelopeType.includes(envelope[1].type as EnvelopeItemType)) {
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

              this.server.close(() => {
                resolve(envelopes);
              });
            }

            resolve(envelopes);
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
}
