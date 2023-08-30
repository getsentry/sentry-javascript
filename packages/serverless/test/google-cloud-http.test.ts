import { BigQuery } from '@google-cloud/bigquery';
import * as SentryNode from '@sentry/node';
import * as fs from 'fs';
import * as nock from 'nock';
import * as path from 'path';

import { GoogleCloudHttp } from '../src/google-cloud-http';

/**
 * Why @ts-ignore some Sentry.X calls
 *
 * A hack-ish way to contain everything related to mocks in the same __mocks__ file.
 * Thanks to this, we don't have to do more magic than necessary. Just add and export desired method and assert on it.
 */

describe('GoogleCloudHttp tracing', () => {
  beforeAll(() => {
    new GoogleCloudHttp().setupOnce();
  });
  beforeEach(() => {
    nock('https://www.googleapis.com')
      .post('/oauth2/v4/token')
      .reply(200, '{"access_token":"a.b.c","expires_in":3599,"token_type":"Bearer"}');
  });
  afterEach(() => {
    // @ts-ignore see "Why @ts-ignore" note
    SentryNode.resetMocks();
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
        .get(new RegExp('^/bigquery/v2/projects/project-id/queries/.+$'))
        .query(true)
        .reply(
          200,
          '{"kind":"bigquery#getQueryResultsResponse","etag":"0+ToZZTzCJ4lyhNI3v4rGg==","schema":{"fields":[{"name":"foo","type":"BOOLEAN","mode":"NULLABLE"}]},"jobReference":{"projectId":"project-id","jobId":"8874c5d5-9cfe-4daa-8390-b0504b97b429","location":"US"},"totalRows":"1","rows":[{"f":[{"v":"true"}]}],"totalBytesProcessed":"0","jobComplete":true,"cacheHit":false}',
        );
      const resp = await bigquery.query('SELECT true AS foo');
      expect(resp).toEqual([[{ foo: true }]]);
      // @ts-ignore see "Why @ts-ignore" note
      expect(SentryNode.fakeTransaction.startChild).toBeCalledWith({
        op: 'http.client.bigquery',
        origin: 'auto.http.serverless',
        description: 'POST /jobs',
      });
      // @ts-ignore see "Why @ts-ignore" note
      expect(SentryNode.fakeTransaction.startChild).toBeCalledWith({
        op: 'http.client.bigquery',
        origin: 'auto.http.serverless',
        description: expect.stringMatching(new RegExp('^GET /queries/.+')),
      });
    });
  });
});
