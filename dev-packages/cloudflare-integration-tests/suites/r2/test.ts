import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpansFromEnvelope } from '../../spanUtils';

it('emits r2_put and r2_get spans with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);

      expect(spans.filter(span => span.name === 'r2_put')).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.put' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'PutObject' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'test-key.txt' },
          }),
        }),
      ]);

      expect(spans.filter(span => span.name === 'r2_get')).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.get' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'GetObject' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'test-key.txt' },
          }),
        }),
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/put-get');
  await runner.completed();
});

it('emits an r2_head span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      expect(getSpansFromEnvelope(envelope).filter(span => span.name === 'r2_head')).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.head' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'HeadObject' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'head-key.txt' },
          }),
        }),
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/head');
  await runner.completed();
});

it('emits an r2_list span without a key attribute', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const listSpans = getSpansFromEnvelope(envelope).filter(span => span.name === 'r2_list');

      expect(listSpans).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.list' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'ListObjects' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
          }),
        }),
      ]);
      expect(listSpans[0]?.attributes['cloudflare.r2.request.key']).toBeUndefined();
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/list');
  await runner.completed();
});

it('emits an r2_delete span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      expect(getSpansFromEnvelope(envelope).filter(span => span.name === 'r2_delete')).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.delete' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'DeleteObject' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'delete-me.txt' },
          }),
        }),
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/delete');
  await runner.completed();
});

it('emits spans for each multipart upload operation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);

      expect(spans.filter(span => span.name === 'r2_createMultipartUpload')).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.multipart_upload.create' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'CreateMultipartUpload' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'multipart.bin' },
          }),
        }),
      ]);

      const uploadPartSpans = spans.filter(span => span.name === 'r2_uploadPart');
      expect(uploadPartSpans).toHaveLength(2);
      expect(uploadPartSpans[0]).toEqual(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.upload_part' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'UploadPart' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'multipart.bin' },
            'cloudflare.r2.request.part_number': { type: 'integer', value: 1 },
          }),
        }),
      );
      expect(uploadPartSpans[1]?.attributes['cloudflare.r2.request.part_number']).toEqual({
        type: 'integer',
        value: 2,
      });

      expect(spans.filter(span => span.name === 'r2_completeMultipartUpload')).toEqual([
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': { type: 'string', value: 'object.multipart_upload.complete' },
            'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.r2' },
            'cloudflare.r2.operation': { type: 'string', value: 'CompleteMultipartUpload' },
            'cloudflare.r2.bucket': { type: 'string', value: 'MY_BUCKET' },
            'cloudflare.r2.request.key': { type: 'string', value: 'multipart.bin' },
          }),
        }),
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/multipart');
  await runner.completed();
});
