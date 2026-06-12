import type { R2Bucket, R2MultipartUpload } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentR2Bucket } from '../../../src/instrumentations/worker/instrumentR2';

const MOCK_R2_OBJECT = {
  key: 'my-file.txt',
  version: 'v1',
  size: 100,
  etag: 'abc',
  httpEtag: '"abc"',
  checksums: {},
  uploaded: new Date(),
  storageClass: 'Standard',
  writeHttpMetadata: vi.fn(),
};

const MOCK_R2_OBJECT_BODY = {
  ...MOCK_R2_OBJECT,
  body: new ReadableStream(),
  bodyUsed: false,
  arrayBuffer: vi.fn(),
  bytes: vi.fn(),
  text: vi.fn(),
  json: vi.fn(),
  blob: vi.fn(),
};

const MOCK_R2_OBJECTS = {
  objects: [MOCK_R2_OBJECT],
  truncated: false,
  delimitedPrefixes: [],
};

const MOCK_UPLOADED_PART = { partNumber: 1, etag: 'part-etag' };

function createMockMultipartUpload(key = 'my-file.txt'): R2MultipartUpload {
  return {
    key,
    uploadId: 'upload-123',
    uploadPart: vi.fn().mockResolvedValue(MOCK_UPLOADED_PART),
    abort: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(MOCK_R2_OBJECT),
  };
}

function createMockR2Bucket(): R2Bucket {
  return {
    head: vi.fn().mockResolvedValue(MOCK_R2_OBJECT),
    get: vi.fn().mockResolvedValue(MOCK_R2_OBJECT_BODY),
    put: vi.fn().mockResolvedValue(MOCK_R2_OBJECT),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue(MOCK_R2_OBJECTS),
    createMultipartUpload: vi.fn().mockImplementation((key: string) => Promise.resolve(createMockMultipartUpload(key))),
    resumeMultipartUpload: vi.fn().mockImplementation((key: string) => createMockMultipartUpload(key)),
  } as unknown as R2Bucket;
}

describe('instrumentR2Bucket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

  describe('get', () => {
    test('forwards the call and returns the result', async () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      const result = await wrapped.get('my-file.txt');
      expect(result).toBe(MOCK_R2_OBJECT_BODY);
      expect(bucket.get).toHaveBeenCalledTimes(1);
    });

    test('starts a span with correct attributes', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.get('my-file.txt');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'cloud.r2',
          name: 'r2_get',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'GetObject',
            'cloudflare.r2.bucket': 'MY_BUCKET',
            'cloudflare.r2.request.key': 'my-file.txt',
            'sentry.op': 'cloud.r2',
            'sentry.origin': 'auto.faas.cloudflare.r2',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('head', () => {
    test('forwards the call and returns the result', async () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      const result = await wrapped.head('my-file.txt');
      expect(result).toBe(MOCK_R2_OBJECT);
      expect(bucket.head).toHaveBeenCalledTimes(1);
    });

    test('starts a span with correct attributes', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.head('my-file.txt');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'cloud.r2',
          name: 'r2_head',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'HeadObject',
            'cloudflare.r2.request.key': 'my-file.txt',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('put', () => {
    test('forwards the call and returns the result', async () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      const result = await wrapped.put('my-file.txt', 'hello');
      expect(result).toBe(MOCK_R2_OBJECT);
      expect(bucket.put).toHaveBeenCalledTimes(1);
      expect(bucket.put).toHaveBeenCalledWith('my-file.txt', 'hello');
    });

    test('starts a span with correct attributes', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.put('upload/photo.jpg', new ArrayBuffer(42));

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'cloud.r2',
          name: 'r2_put',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'PutObject',
            'cloudflare.r2.request.key': 'upload/photo.jpg',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('delete', () => {
    test('forwards the call with a single key', async () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      await wrapped.delete('my-file.txt');
      expect(bucket.delete).toHaveBeenCalledTimes(1);
    });

    test('starts a span with the key', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.delete('my-file.txt');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'cloud.r2',
          name: 'r2_delete',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'DeleteObject',
            'cloudflare.r2.request.key': 'my-file.txt',
          }),
        }),
        expect.any(Function),
      );
    });

    test('joins multiple keys in the attribute', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.delete(['a.txt', 'b.txt']);

      const attrs = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(attrs['cloudflare.r2.request.key']).toBe('a.txt, b.txt');
    });
  });

  describe('list', () => {
    test('forwards the call and returns the result', async () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      const result = await wrapped.list();
      expect(result).toBe(MOCK_R2_OBJECTS);
    });

    test('starts a span without a key attribute', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.list({ prefix: 'uploads/' });

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'cloud.r2',
          name: 'r2_list',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'ListObjects',
          }),
        }),
        expect.any(Function),
      );
      expect(startSpanSpy.mock.calls[0]![0].attributes!['cloudflare.r2.request.key']).toBeUndefined();
    });
  });

  describe('createMultipartUpload', () => {
    test('forwards the call and returns an instrumented upload', async () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      const upload = await wrapped.createMultipartUpload('big-file.bin');
      expect(upload.key).toBe('big-file.bin');
      expect(upload.uploadId).toBe('upload-123');
      expect(bucket.createMultipartUpload).toHaveBeenCalledTimes(1);
    });

    test('starts a span for the createMultipartUpload call', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      await wrapped.createMultipartUpload('big-file.bin');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op: 'cloud.r2',
          name: 'r2_createMultipartUpload',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'CreateMultipartUpload',
            'cloudflare.r2.request.key': 'big-file.bin',
          }),
        }),
        expect.any(Function),
      );
    });

    test('instruments the returned multipart upload', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      const upload = await wrapped.createMultipartUpload('big-file.bin');

      startSpanSpy.mockClear();
      await upload.uploadPart(1, 'part-data');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'r2_uploadPart',
          attributes: expect.objectContaining({
            'cloudflare.r2.request.key': 'big-file.bin',
            'cloudflare.r2.request.part_number': 1,
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('resumeMultipartUpload', () => {
    test('forwards the call and returns an instrumented upload', () => {
      const bucket = createMockR2Bucket();
      const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET');

      const upload = wrapped.resumeMultipartUpload('my-file.txt', 'upload-123');
      expect(upload.key).toBe('my-file.txt');
      expect(upload.uploadId).toBe('upload-123');
      expect(bucket.resumeMultipartUpload).toHaveBeenCalledTimes(1);
    });

    test('does not start a span for resumeMultipartUpload itself', () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      wrapped.resumeMultipartUpload('my-file.txt', 'upload-123');

      expect(startSpanSpy).not.toHaveBeenCalled();
    });

    test('instruments the returned multipart upload operations', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      const upload = wrapped.resumeMultipartUpload('my-file.txt', 'upload-123');

      await upload.abort();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'r2_abortMultipartUpload',
          attributes: expect.objectContaining({
            'cloudflare.r2.request.key': 'my-file.txt',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('multipart upload operations', () => {
    test('uploadPart returns the uploaded part', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      const upload = wrapped.resumeMultipartUpload('my-file.txt', 'upload-123');

      const part = await upload.uploadPart(1, 'data');
      expect(part).toEqual(MOCK_UPLOADED_PART);
    });

    test('complete returns the final R2Object', async () => {
      const wrapped = instrumentR2Bucket(createMockR2Bucket(), 'MY_BUCKET');
      const upload = wrapped.resumeMultipartUpload('my-file.txt', 'upload-123');

      const result = await upload.complete([MOCK_UPLOADED_PART]);
      expect(result).toBe(MOCK_R2_OBJECT);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'r2_completeMultipartUpload',
          attributes: expect.objectContaining({
            'cloudflare.r2.operation': 'CompleteMultipartUpload',
            'cloudflare.r2.request.key': 'my-file.txt',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  test('forwards unknown property accesses transparently', () => {
    const bucket = Object.assign(createMockR2Bucket(), {
      customMethod: vi.fn().mockReturnValue('hi'),
    }) as unknown as R2Bucket & { customMethod: () => string };
    const wrapped = instrumentR2Bucket(bucket, 'MY_BUCKET') as R2Bucket & { customMethod: () => string };
    expect(wrapped.customMethod()).toBe('hi');
  });
});
