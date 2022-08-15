/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { logger, parseSemver } from '@sentry/utils';
import axios from 'axios';
import { Express } from 'express';
import * as http from 'http';
import { RequestOptions } from 'https';
import nock from 'nock';
import * as path from 'path';
import { getPortPromise } from 'portfinder';

export type TestServerConfig = {
  url: string;
  server: http.Server;
  scope: nock.Scope;
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
 * @param config The url, server instance and the nock scope.
 * @param count The expected amount of requests to the envelope endpoint. If
 * the amount of sentrequests is lower than`count`, this function will not resolve.
 * @param method The method of the request. Defaults to `GET`.
 * @param endServer: Whether to stop the server after the requests have been intercepted.
 * @returns The intercepted envelopes.
 */
export const getMultipleEnvelopeRequest = async (
  config: TestServerConfig,
  count: number,
  method: 'get' | 'post' = 'get',
  endServer: boolean = true,
): Promise<Record<string, unknown>[][]> => {
  // eslint-disable-next-line no-async-promise-executor
  return (
    await Promise.all([setupNock(config.scope, config.server, count, endServer), makeRequest(method, config.url)])
  )[0];
};

const setupNock = async (
  scope: nock.Scope,
  server: http.Server,
  count: number,
  endServer: boolean,
): Promise<Record<string, unknown>[][]> => {
  return new Promise(resolve => {
    const envelopes: Record<string, unknown>[][] = [];

    scope
      .post('/api/1337/envelope/', body => {
        const envelope = parseEnvelope(body);

        envelopes.push(envelope);

        if (count === envelopes.length) {
          if (endServer) {
            scope.persist(false);
            server.close(() => {
              resolve(envelopes);
            });
          }
          resolve(envelopes);
        }

        return true;
      })
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
 * @param {URL} url
 * @param {Record<string, string>} [headers]
 * @return {*}  {Promise<any>}
 */
export const getAPIResponse = async (config: TestServerConfig, headers?: Record<string, string>): Promise<unknown> => {
  return new Promise(resolve => {
    const url = new URL(config.url);

    http.get(
      headers
        ? ({
            protocol: url.protocol,
            host: url.hostname,
            path: url.pathname,
            port: url.port,
            headers,
          } as RequestOptions)
        : url,
      response => {
        let body = '';

        response.on('data', function (chunk: string) {
          body += chunk;
        });
        response.on('end', function () {
          config.scope.persist(false);
          config.server.close(() => {
            resolve(JSON.parse(body));
          });
        });
      },
    );
  });
};

/**
 * Intercepts and extracts a single request containing a Sentry envelope
 *
 * @param url The url the intercepted request will be directed to.
 * @param method The method of the request. Defaults to `GET`.
 * @returns The extracted envelope.
 */
export const getEnvelopeRequest = async (
  config: TestServerConfig,
  method: 'get' | 'post' = 'get',
  endServer: boolean = true,
): Promise<Array<Record<string, unknown>>> => {
  return (await getMultipleEnvelopeRequest(config, 1, method, endServer))[0];
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

  const { server, scope } = await new Promise<{ server: http.Server; scope: nock.Scope }>(resolve => {
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
      const scope = nock('https://dsn.ingest.sentry.io').persist();

      resolve({ server, scope });
    });
  });

  return { url, server, scope };
}

export async function runScenario(serverUrl: string): Promise<void> {
  return new Promise<void>(resolve => {
    http
      .get(serverUrl, res => {
        res.on('data', () => undefined);
        res.on('end', resolve);
      })
      .end();
  });
}
