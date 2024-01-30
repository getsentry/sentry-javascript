import { NodeClient, createTransport, setCurrentClient } from '@sentry/node';
import * as AWS from 'aws-sdk';
import * as nock from 'nock';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { awsServicesIntegration } from '../src/awsservices';

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

describe('awsServicesIntegration', () => {
  const mockClient = new NodeClient({
    tracesSampleRate: 1.0,
    integrations: [],
    dsn: 'https://withAWSServices@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
  });

  const integration = awsServicesIntegration();
  mockClient.addIntegration(integration);

  const mockClientWithoutIntegration = new NodeClient({
    tracesSampleRate: 1.0,
    integrations: [],
    dsn: 'https://withoutAWSServices@domain/123',
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
  });

  afterAll(() => {
    nock.restore();
  });

  beforeEach(() => {
    setCurrentClient(mockClient);
    mockSpanEnd.mockClear();
    mockStartInactiveSpan.mockClear();
  });

  describe('S3 tracing', () => {
    const s3 = new AWS.S3({ accessKeyId: '-', secretAccessKey: '-' });

    test('getObject', async () => {
      nock('https://foo.s3.amazonaws.com').get('/bar').reply(200, 'contents');
      const data = await s3.getObject({ Bucket: 'foo', Key: 'bar' }).promise();
      expect(data.Body?.toString('utf-8')).toEqual('contents');
      expect(mockStartInactiveSpan).toBeCalledWith({
        op: 'http.client',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
        },
        name: 'aws.s3.getObject foo',
        onlyIfParent: true,
      });

      expect(mockSpanEnd).toHaveBeenCalledTimes(1);
    });

    test('getObject with integration-less client', async () => {
      setCurrentClient(mockClientWithoutIntegration);
      nock('https://foo.s3.amazonaws.com').get('/bar').reply(200, 'contents');
      await s3.getObject({ Bucket: 'foo', Key: 'bar' }).promise();
      expect(mockStartInactiveSpan).not.toBeCalled();
    });

    test('getObject with callback', done => {
      expect.assertions(3);
      nock('https://foo.s3.amazonaws.com').get('/bar').reply(200, 'contents');
      s3.getObject({ Bucket: 'foo', Key: 'bar' }, (err, data) => {
        expect(err).toBeNull();
        expect(data.Body?.toString('utf-8')).toEqual('contents');
        done();
      });
      expect(mockStartInactiveSpan).toBeCalledWith({
        op: 'http.client',
        name: 'aws.s3.getObject foo',
        onlyIfParent: true,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
        },
      });
    });

    test('getObject with callback with integration-less client', done => {
      setCurrentClient(mockClientWithoutIntegration);
      expect.assertions(1);
      nock('https://foo.s3.amazonaws.com').get('/bar').reply(200, 'contents');
      s3.getObject({ Bucket: 'foo', Key: 'bar' }, () => {
        done();
      });
      expect(mockStartInactiveSpan).not.toBeCalled();
    });
  });

  describe('Lambda', () => {
    const lambda = new AWS.Lambda({ accessKeyId: '-', secretAccessKey: '-', region: 'eu-north-1' });

    test('invoke', async () => {
      nock('https://lambda.eu-north-1.amazonaws.com').post('/2015-03-31/functions/foo/invocations').reply(201, 'reply');
      const data = await lambda.invoke({ FunctionName: 'foo' }).promise();
      expect(data.Payload?.toString('utf-8')).toEqual('reply');
      expect(mockStartInactiveSpan).toBeCalledWith({
        op: 'http.client',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.serverless',
        },
        name: 'aws.lambda.invoke foo',
        onlyIfParent: true,
      });
      expect(mockSpanEnd).toHaveBeenCalledTimes(1);
    });

    test('invoke with integration-less client', async () => {
      setCurrentClient(mockClientWithoutIntegration);
      nock('https://lambda.eu-north-1.amazonaws.com').post('/2015-03-31/functions/foo/invocations').reply(201, 'reply');
      await lambda.invoke({ FunctionName: 'foo' }).promise();
      expect(mockStartInactiveSpan).not.toBeCalled();
    });
  });
});
