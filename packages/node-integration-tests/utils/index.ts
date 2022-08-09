/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { logger, parseSemver } from '@sentry/utils';
import axios from 'axios';
import { Express } from 'express';
import * as http from 'http';
import { RequestOptions } from 'https';
import nock from 'nock';
import * as path from 'path';
import { getPortPromise } from 'portfinder';
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
 * @param url The url the intercepted requests will be directed to.
 * @param count The expected amount of requests to the envelope endpoint. If
 * the amount of sentrequests is lower than`count`, this function will not resolve.
 * @param method The method of the request. Defaults to `GET`.
 * @returns The intercepted envelopes.
 */
export const getMultipleEnvelopeRequest = async (
  url: string,
  count: number,
  method: 'get' | 'post' = 'get',
): Promise<Record<string, unknown>[][]> => {
  const envelopes: Record<string, unknown>[][] = [];

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async resolve => {
    nock('https://dsn.ingest.sentry.io')
      .post('/api/1337/envelope/', body => {
        const envelope = parseEnvelope(body);
        envelopes.push(envelope);

        if (count === envelopes.length) {
          resolve(envelopes);
        }

        return true;
      })
      .times(count)
      .query(true) // accept any query params - used for sentry_key param
      .reply(200);

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
  });
};

/**
 * Sends a get request to given URL, with optional headers
 *
 * @param {URL} url
 * @param {Record<string, string>} [headers]
 * @return {*}  {Promise<any>}
 */
export const getAPIResponse = async (url: URL, headers?: Record<string, string>): Promise<unknown> => {
  return new Promise(resolve => {
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
          resolve(JSON.parse(body));
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
  url: string,
  method: 'get' | 'post' = 'get',
): Promise<Array<Record<string, unknown>>> => {
  return (await getMultipleEnvelopeRequest(url, 1, method))[0];
};

/**
 * Runs a test server
 *
 * @param {string} testDir
 * @param {string} [serverPath]
 * @param {string} [scenarioPath]
 * @return {*}  {Promise<string>}
 */
export async function runServer(testDir: string, serverPath?: string, scenarioPath?: string): Promise<string> {
  const port = await getPortPromise();
  const url = `http://localhost:${port}/test`;
  const defaultServerPath = path.resolve(process.cwd(), 'utils', 'defaults', 'server');

  await new Promise<void>(resolve => {
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
      resolve();
      setTimeout(() => {
        server.close();
      }, 4000);
    });
  });

  return url;
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
