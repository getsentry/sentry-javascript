import * as AWS from 'aws-sdk';
import * as nock from 'nock';

import * as Sentry from '../src';
import { AWSServices } from '../src/awsservices';

/**
 * Why @ts-ignore some Sentry.X calls
 *
 * A hack-ish way to contain everything related to mocks in the same __mocks__ file.
 * Thanks to this, we don't have to do more magic than necessary. Just add and export desired method and assert on it.
 */

describe('AWSServices', () => {
  beforeAll(() => {
    new AWSServices().setupOnce();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  afterAll(() => {
    nock.restore();
  });

  describe('S3 tracing', () => {
    const s3 = new AWS.S3({ accessKeyId: '-', secretAccessKey: '-' });

    test('getObject', async () => {
      nock('https://foo.s3.amazonaws.com').get('/bar').reply(200, 'contents');
      const data = await s3.getObject({ Bucket: 'foo', Key: 'bar' }).promise();
      expect(data.Body?.toString('utf-8')).toEqual('contents');
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.startChild).toBeCalledWith({
        op: 'http.client',
        description: 'aws.s3.getObject foo',
      });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeSpan.finish).toBeCalled();
    });

    test('getObject with callback', done => {
      expect.assertions(3);
      nock('https://foo.s3.amazonaws.com').get('/bar').reply(200, 'contents');
      s3.getObject({ Bucket: 'foo', Key: 'bar' }, (err, data) => {
        expect(err).toBeNull();
        expect(data.Body?.toString('utf-8')).toEqual('contents');
        done();
      });
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.startChild).toBeCalledWith({
        op: 'http.client',
        description: 'aws.s3.getObject foo',
      });
    });
  });

  describe('Lambda', () => {
    const lambda = new AWS.Lambda({ accessKeyId: '-', secretAccessKey: '-', region: 'eu-north-1' });

    test('invoke', async () => {
      nock('https://lambda.eu-north-1.amazonaws.com').post('/2015-03-31/functions/foo/invocations').reply(201, 'reply');
      const data = await lambda.invoke({ FunctionName: 'foo' }).promise();
      expect(data.Payload?.toString('utf-8')).toEqual('reply');
      // @ts-ignore see "Why @ts-ignore" note
      expect(Sentry.fakeTransaction.startChild).toBeCalledWith({
        op: 'http.client',
        description: 'aws.lambda.invoke foo',
      });
    });
  });
});
