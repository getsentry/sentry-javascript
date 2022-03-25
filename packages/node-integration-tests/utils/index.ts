/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Express } from 'express';
import * as http from 'http';
import nock from 'nock';
import * as path from 'path';
import { getPortPromise } from 'portfinder';

export const assertSentryEvent = (actual: Record<string, unknown>, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.any(Number),
    ...expected,
  });
};

export const assertSentryTransaction = (actual: Record<string, unknown>, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.any(Number),
    start_timestamp: expect.any(Number),
    spans: expect.any(Array),
    type: 'transaction',
    ...expected,
  });
};

export const parseEnvelope = (body: string): Array<Record<string, unknown>> => {
  return body.split('\n').map(e => JSON.parse(e));
};

export const getMultipleEventRequests = async (url: string, count: number): Promise<Array<Record<string, unknown>>> => {
  const events: Record<string, unknown>[] = [];

  return new Promise(resolve => {
    nock('https://dsn.ingest.sentry.io')
      .post('/api/1337/store/', body => {
        events.push(body);

        if (events.length === count) {
          resolve(events);
        }
        return true;
      })
      .times(7)
      .reply(200);
    http.get(url);
  });
};

export const getEventRequest = async (url: string): Promise<Record<string, unknown>> => {
  return (await getMultipleEventRequests(url, 1))[0];
};

export const getEnvelopeRequest = async (url: string): Promise<Array<Record<string, unknown>>> => {
  return new Promise(resolve => {
    nock('https://dsn.ingest.sentry.io')
      .post('/api/1337/envelope/', body => {
        const envelope = parseEnvelope(body);
        resolve(envelope);
        return true;
      })
      .reply(200);

    http.get(url);
  });
};

export async function runServer(testDir: string, serverPath?: string, scenarioPath?: string): Promise<string> {
  const port = await getPortPromise();
  const url = `http://localhost:${port}/test`;
  const defaultServerPath = path.resolve(process.cwd(), 'utils', 'defaults', 'server');

  await new Promise(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
    const app = require(serverPath || defaultServerPath).default as Express;

    app.get('/test', async () => {
      require(scenarioPath || `${testDir}/scenario`);

      setTimeout(() => server.close(), 500);
    });

    const server = app.listen(port, () => {
      resolve();
    });
  });

  return url;
}
