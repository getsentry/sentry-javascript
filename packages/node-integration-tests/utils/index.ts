/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as Sentry from '@sentry/node';
import { logger, parseSemver } from '@sentry/utils';
import axios from 'axios';
import { Express } from 'express';
import * as http from 'http';
import nock from 'nock';
import * as path from 'path';
import { getPortPromise } from 'portfinder';

export type TestServerConfig = {
  url: string;
  server: http.Server;
};

export type DataCollectorOptions = {
  // The expected amount of requests to the envelope endpoint.
  // If the amount of sentrequests is lower than`count`, this function will not resolve.
  count?: number;

  // The method of the request.
  method?: 'get' | 'post';

  // Whether to stop the server after the requests have been intercepted
  endServer?: boolean;

  // Type of the envelopes to capture
  envelopeType?: string;
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
 * Intercepts and extracts up to a number of requests containing Sentry envelopes.
 *
 * @param {TestServerConfig} config The url, server instance and the nock scope.
 * @param {DataCollectorOptions} options
 * @returns The intercepted envelopes.
 */
export const getMultipleEnvelopeRequest = async (
  config: TestServerConfig,
  options: DataCollectorOptions,
): Promise<Record<string, unknown>[][]> => {
  const resProm = setupNock(
    config.server,
    options.count || 1,
    typeof options.endServer === 'undefined' ? true : options.endServer,
    options.envelopeType || 'event',
  );

  void makeRequest(options.method || 'get', config.url);
  return resProm;
};

const setupNock = async (
  server: http.Server,
  count: number,
  endServer: boolean,
  envelopeType: string,
): Promise<Record<string, unknown>[][]> => {
  return new Promise(resolve => {
    const envelopes: Record<string, unknown>[][] = [];
    const mock = nock('https://dsn.ingest.sentry.io')
      .persist()
      .post('/api/1337/envelope/', body => {
        const envelope = parseEnvelope(body);

        if (envelope[1].type === envelopeType) {
          envelopes.push(envelope);
        } else {
          return false;
        }

        if (count === envelopes.length) {
          nock.removeInterceptor(mock);
          nock.cleanAll();

          if (endServer) {
            server.close(() => {
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
};

const makeRequest = async (method: 'get' | 'post', url: string): Promise<void> => {
  try {
    if (method === 'get') {
      await axios.get(url);
    } else {
      await axios.post(url);
    }
  } catch (e) {
    // We sometimes expect the request to fail, but not the test.
    // So, we do nothing.
    logger.warn(e);
  }
};

/**
 * Sends a get request to given URL, with optional headers
 *
 * @param {TestServerConfig} config The url, server instance and the nock scope.
 * @param {Record<string, string>} [headers]
 * @return {*}  {Promise<any>}
 */
export const getAPIResponse = async (config: TestServerConfig, headers?: Record<string, string>): Promise<unknown> => {
  const { data } = await axios.get(config.url, { headers: headers || {} });

  await Sentry.flush();
  config.server.close();

  return data;
};

/**
 * Intercepts and extracts a single request containing a Sentry envelope
 *
 * @param {TestServerConfig} config The url, server instance and the nock scope.
 * @param {DataCollectorOptions} options
 * @returns The extracted envelope.
 */
export const getEnvelopeRequest = async (
  config: TestServerConfig,
  options?: DataCollectorOptions,
): Promise<Array<Record<string, unknown>>> => {
  return (await getMultipleEnvelopeRequest(config, { ...options, count: 1 }))[0];
};

/**
 * Runs a test server
 *
 * @param {string} testDir
 * @param {string} [serverPath]
 * @param {string} [scenarioPath]
 * @return {*}  {Promise<string>}
 */
export async function runServer(
  testDir: string,
  serverPath?: string,
  scenarioPath?: string,
): Promise<TestServerConfig> {
  const port = await getPortPromise();
  const url = `http://localhost:${port}/test`;
  const defaultServerPath = path.resolve(process.cwd(), 'utils', 'defaults', 'server');

  const server = await new Promise<http.Server>(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
    const app = require(serverPath || defaultServerPath).default as Express;

    app.get('/test', (_req, res) => {
      try {
        require(scenarioPath || `${testDir}/scenario`);
      } finally {
        res.status(200).end();
      }
    });

    const server = app.listen(port, () => {
      resolve(server);
    });
  });

  return { url, server };
}

export async function runScenario(url: string): Promise<void> {
  await axios.get(url);
  await Sentry.flush();
}
