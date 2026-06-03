import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function envelopeItemType(envelope: Envelope): string | undefined {
  return envelope[1][0]?.[0]?.type as string | undefined;
}

function envelopeItem(envelope: Envelope): Record<string, unknown> {
  return envelope[1][0]![1] as Record<string, unknown>;
}

function findSpans(envelope: Envelope, description: string): Array<Record<string, unknown>> {
  if (envelopeItemType(envelope) !== 'transaction') return [];
  const tx = envelopeItem(envelope);
  const spans = (tx.spans as Array<Record<string, unknown>>) || [];
  return spans.filter(s => s.description === description);
}

function spanData(span: Record<string, unknown>): Record<string, unknown> {
  return span.data as Record<string, unknown>;
}

it('emits r2_put and r2_get spans with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const putSpans = findSpans(envelope, 'r2_put');
      expect(putSpans).toHaveLength(1);
      const putData = spanData(putSpans[0]!);
      expect({
        op: putSpans[0]!.op,
        description: putSpans[0]!.description,
        'cloudflare.r2.operation': putData['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': putData['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': putData['cloudflare.r2.request.key'],
        'sentry.origin': putData['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_put',
        'cloudflare.r2.operation': 'PutObject',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'test-key.txt',
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });

      const getSpans = findSpans(envelope, 'r2_get');
      expect(getSpans).toHaveLength(1);
      const getData = spanData(getSpans[0]!);
      expect({
        op: getSpans[0]!.op,
        description: getSpans[0]!.description,
        'cloudflare.r2.operation': getData['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': getData['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': getData['cloudflare.r2.request.key'],
        'sentry.origin': getData['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_get',
        'cloudflare.r2.operation': 'GetObject',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'test-key.txt',
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/put-get');
  await runner.completed();
});

it('emits an r2_head span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const spans = findSpans(envelope, 'r2_head');
      expect(spans).toHaveLength(1);
      const data = spanData(spans[0]!);
      expect({
        op: spans[0]!.op,
        description: spans[0]!.description,
        'cloudflare.r2.operation': data['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': data['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': data['cloudflare.r2.request.key'],
        'sentry.origin': data['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_head',
        'cloudflare.r2.operation': 'HeadObject',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'head-key.txt',
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/head');
  await runner.completed();
});

it('emits an r2_list span without a key attribute', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const spans = findSpans(envelope, 'r2_list');
      expect(spans).toHaveLength(1);
      const data = spanData(spans[0]!);
      expect({
        op: spans[0]!.op,
        description: spans[0]!.description,
        'cloudflare.r2.operation': data['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': data['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': data['cloudflare.r2.request.key'],
        'sentry.origin': data['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_list',
        'cloudflare.r2.operation': 'ListObjects',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': undefined,
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/list');
  await runner.completed();
});

it('emits an r2_delete span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const spans = findSpans(envelope, 'r2_delete');
      expect(spans).toHaveLength(1);
      const data = spanData(spans[0]!);
      expect({
        op: spans[0]!.op,
        description: spans[0]!.description,
        'cloudflare.r2.operation': data['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': data['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': data['cloudflare.r2.request.key'],
        'sentry.origin': data['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_delete',
        'cloudflare.r2.operation': 'DeleteObject',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'delete-me.txt',
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/delete');
  await runner.completed();
});

it('emits spans for each multipart upload operation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const createSpans = findSpans(envelope, 'r2_createMultipartUpload');
      expect(createSpans).toHaveLength(1);
      const createData = spanData(createSpans[0]!);
      expect({
        op: createSpans[0]!.op,
        description: createSpans[0]!.description,
        'cloudflare.r2.operation': createData['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': createData['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': createData['cloudflare.r2.request.key'],
        'sentry.origin': createData['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_createMultipartUpload',
        'cloudflare.r2.operation': 'CreateMultipartUpload',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'multipart.bin',
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });

      const uploadPartSpans = findSpans(envelope, 'r2_uploadPart');
      expect(uploadPartSpans).toHaveLength(2);
      const part0Data = spanData(uploadPartSpans[0]!);
      expect({
        op: uploadPartSpans[0]!.op,
        description: uploadPartSpans[0]!.description,
        'cloudflare.r2.operation': part0Data['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': part0Data['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': part0Data['cloudflare.r2.request.key'],
        'cloudflare.r2.request.part_number': part0Data['cloudflare.r2.request.part_number'],
        'sentry.origin': part0Data['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_uploadPart',
        'cloudflare.r2.operation': 'UploadPart',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'multipart.bin',
        'cloudflare.r2.request.part_number': 1,
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });
      expect(spanData(uploadPartSpans[1]!)['cloudflare.r2.request.part_number']).toBe(2);

      const completeSpans = findSpans(envelope, 'r2_completeMultipartUpload');
      expect(completeSpans).toHaveLength(1);
      const completeData = spanData(completeSpans[0]!);
      expect({
        op: completeSpans[0]!.op,
        description: completeSpans[0]!.description,
        'cloudflare.r2.operation': completeData['cloudflare.r2.operation'],
        'cloudflare.r2.bucket': completeData['cloudflare.r2.bucket'],
        'cloudflare.r2.request.key': completeData['cloudflare.r2.request.key'],
        'sentry.origin': completeData['sentry.origin'],
      }).toEqual({
        op: 'cloud.r2',
        description: 'r2_completeMultipartUpload',
        'cloudflare.r2.operation': 'CompleteMultipartUpload',
        'cloudflare.r2.bucket': 'MY_BUCKET',
        'cloudflare.r2.request.key': 'multipart.bin',
        'sentry.origin': 'auto.faas.cloudflare.r2',
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/r2/multipart');
  await runner.completed();
});
