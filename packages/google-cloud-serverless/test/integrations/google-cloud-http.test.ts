import { BigQuery } from '@google-cloud/bigquery';
import { HTTP_REQUEST_METHOD, SENTRY_OP, SERVER_ADDRESS, URL_FULL } from '@sentry/conventions/attributes';
import { WEB_SERVER_HTTP_CLIENT_SPAN_OP } from '@sentry/conventions/op';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { createTransport, NodeClient, setCurrentClient } from '@sentry/node';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore ESM/CJS interop issue
import nock from 'nock';
import * as path from 'path';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { googleCloudHttpIntegration } from '../../src/integrations/google-cloud-http';

const mockSpanEnd = vi.fn();
const mockStartInactiveSpan = vi.fn(spanArgs => ({ ...spanArgs }));

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    startInactiveSpan: (ctx: unknown) => {
      mockStartInactiveSpan(ctx);
      return { end: mockSpanEnd };
    },
  };
});

describe('GoogleCloudHttp tracing', () => {
  const mockClient = new NodeClient({
    tracesSampleRate: 1.0,
    integrations: [],
    dsn: 'https://withAWSServices@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
  });

  const integration = googleCloudHttpIntegration();
  mockClient.addIntegration(integration);

  beforeEach(() => {
    nock('https://www.googleapis.com')
      .post('/oauth2/v4/token')
      .reply(200, '{"access_token":"a.b.c","expires_in":3599,"token_type":"Bearer"}');
    setCurrentClient(mockClient);
    mockSpanEnd.mockClear();
    mockStartInactiveSpan.mockClear();
  });

  afterAll(() => {
    nock.restore();
  });

  // We use google cloud bigquery as an example of http restful service for which we can trace requests.
  describe('bigquery', () => {
    const bigquery = new BigQuery({
      credentials: {
        client_email: 'client@email',
        private_key: fs.readFileSync(path.resolve(__dirname, 'private.pem')).toString(),
      },
      projectId: 'project-id',
    });

    test('query', async () => {
      nock('https://bigquery.googleapis.com')
        .post('/bigquery/v2/projects/project-id/jobs')
        .query(true)
        .reply(
          200,
          '{"kind":"bigquery#job","configuration":{"query":{"query":"SELECT true AS foo","destinationTable":{"projectId":"project-id","datasetId":"_7b1eed9bef45ab5fb7345c3d6f662cd767e5ab3e","tableId":"anon101ee25adad33d4f09179679ae9144ad436a210e"},"writeDisposition":"WRITE_TRUNCATE","priority":"INTERACTIVE","useLegacySql":false},"jobType":"QUERY"},"jobReference":{"projectId":"project-id","jobId":"8874c5d5-9cfe-4daa-8390-b0504b97b429","location":"US"},"statistics":{"creationTime":"1603072686488","startTime":"1603072686756","query":{"statementType":"SELECT"}},"status":{"state":"RUNNING"}}',
        );
      nock('https://bigquery.googleapis.com')
        .get(/^\/bigquery\/v2\/projects\/project-id\/queries\/.+$/)
        .query(true)
        .reply(
          200,
          '{"kind":"bigquery#getQueryResultsResponse","etag":"0+ToZZTzCJ4lyhNI3v4rGg==","schema":{"fields":[{"name":"foo","type":"BOOLEAN","mode":"NULLABLE"}]},"jobReference":{"projectId":"project-id","jobId":"8874c5d5-9cfe-4daa-8390-b0504b97b429","location":"US"},"totalRows":"1","rows":[{"f":[{"v":"true"}]}],"totalBytesProcessed":"0","jobComplete":true,"cacheHit":false}',
        );
      const resp = await bigquery.query('SELECT true AS foo');
      expect(resp).toEqual([[{ foo: true }]]);
      expect(mockStartInactiveSpan).toBeCalledWith({
        name: 'POST /jobs',
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: WEB_SERVER_HTTP_CLIENT_SPAN_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
          [HTTP_REQUEST_METHOD]: 'POST',
          [SERVER_ADDRESS]: 'bigquery.googleapis.com',
          [URL_FULL]: '/jobs',
        },
      });
      expect(mockStartInactiveSpan).toBeCalledWith({
        name: expect.stringMatching(/^GET \/queries\/.+/),
        onlyIfParent: true,
        attributes: {
          [SENTRY_OP]: WEB_SERVER_HTTP_CLIENT_SPAN_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
          [HTTP_REQUEST_METHOD]: 'GET',
          [SERVER_ADDRESS]: 'bigquery.googleapis.com',
          [URL_FULL]: expect.stringMatching(/^\/queries\/.+/),
        },
      });
    });

    // Span names follow `METHOD scheme://host/path`, so a query string must never reach the name,
    // whatever the caller passes as `uri`.
    test('strips the query string from the span name', async () => {
      nock('https://bigquery.googleapis.com')
        .get('/bigquery/v2/projects/project-id/datasets')
        .query(true)
        .reply(200, '{}');

      await new Promise<void>((resolve, reject) => {
        (bigquery as unknown as { request: (o: unknown, cb: (e: unknown) => void) => void }).request(
          { uri: '/datasets?key=SECRET_TOKEN_VALUE&alt=json', method: 'GET' },
          (err: unknown) => (err ? reject(err) : resolve()),
        );
      });

      expect(mockStartInactiveSpan).toBeCalledWith(expect.objectContaining({ name: 'GET /datasets' }));
      const names = mockStartInactiveSpan.mock.calls.map(([args]) => (args as { name: string }).name);
      expect(names.join('\n')).not.toContain('SECRET_TOKEN_VALUE');
    });
  });
});
