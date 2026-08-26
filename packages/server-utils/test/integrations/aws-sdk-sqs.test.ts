import { describe, expect, it } from 'vitest';
import { SqsServiceExtension } from '../../src/integrations/aws-sdk/services/sqs';
import type { RequestMetadata } from '../../src/integrations/aws-sdk/types';

function preSpanHook(commandName: string, commandInput: Record<string, unknown>): RequestMetadata {
  return new SqsServiceExtension().requestPreSpanHook({ serviceName: 'SQS', commandName, commandInput });
}

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue';

describe('SqsServiceExtension span naming', () => {
  it.each([
    ['ReceiveMessage', 'my-queue receive'],
    ['SendMessage', 'my-queue send'],
    ['SendMessageBatch', 'my-queue send'],
  ])('names a %s span after the queue', (commandName, expected) => {
    expect(preSpanHook(commandName, { QueueUrl: QUEUE_URL }).spanName).toBe(expected);
  });

  // Interpolating the missing queue would produce the literal name 'undefined receive'.
  it.each(['ReceiveMessage', 'SendMessage'])('leaves a %s span unnamed when the QueueUrl is missing', commandName => {
    const { spanName, spanAttributes } = preSpanHook(commandName, {});

    expect(spanName).toBeUndefined();
    expect(spanAttributes?.['messaging.destination.name']).toBeUndefined();
  });

  it('treats a trailing slash as no queue name rather than an empty one', () => {
    expect(preSpanHook('ReceiveMessage', { QueueUrl: `${QUEUE_URL}/` }).spanName).toBeUndefined();
  });
});
