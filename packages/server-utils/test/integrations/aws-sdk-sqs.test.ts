import { setCurrentClient } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SqsServiceExtension } from '../../src/integrations/aws-sdk/services/sqs';
import type { RequestMetadata } from '../../src/integrations/aws-sdk/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

function setUpClient(traceLifecycle: 'stream' | 'static'): void {
  const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle, tracesSampleRate: 1 }));
  setCurrentClient(client);
  client.init();
}

function preSpanHook(commandName: string, commandInput: Record<string, unknown>): RequestMetadata {
  return new SqsServiceExtension().requestPreSpanHook({ serviceName: 'SQS', commandName, commandInput });
}

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue';

describe('SqsServiceExtension span naming', () => {
  afterEach(() => {
    setCurrentClient(undefined as never);
  });

  describe('with span streaming', () => {
    it.each([
      ['ReceiveMessage', 'receive my-queue'],
      ['SendMessage', 'send my-queue'],
      ['SendMessageBatch', 'send my-queue'],
    ])('names a %s span with the operation before the destination', (commandName, expected) => {
      setUpClient('stream');

      expect(preSpanHook(commandName, { QueueUrl: QUEUE_URL }).spanName).toBe(expected);
    });

    it.each([
      ['ReceiveMessage', 'receive'],
      ['SendMessage', 'send'],
    ])('drops the destination from a %s span when the QueueUrl is missing', (commandName, expected) => {
      setUpClient('stream');

      const { spanName, spanAttributes } = preSpanHook(commandName, {});

      expect(spanName).toBe(expected);
      expect(spanAttributes?.['messaging.destination.name']).toBeUndefined();
    });

    // The aws-sdk house style (`SQS.DeleteMessage`) still names these, and they are not queue spans.
    it('leaves a command with no messaging operation unnamed and on the default op', () => {
      setUpClient('stream');

      const { spanName, spanOp } = preSpanHook('DeleteMessage', { QueueUrl: QUEUE_URL });

      expect(spanName).toBeUndefined();
      expect(spanOp).toBeUndefined();
    });

    it.each([
      ['ReceiveMessage', 'queue.receive'],
      ['SendMessage', 'queue.publish'],
      ['SendMessageBatch', 'queue.publish'],
    ])('gives a %s span the %s op', (commandName, expected) => {
      setUpClient('stream');

      expect(preSpanHook(commandName, { QueueUrl: QUEUE_URL }).spanOp).toBe(expected);
    });

    it.each([
      ['ReceiveMessage', 'receive'],
      ['SendMessage', 'send'],
      ['SendMessageBatch', 'send'],
    ])('reports the operation type it names a %s span after', (commandName, expected) => {
      setUpClient('stream');

      expect(preSpanHook(commandName, { QueueUrl: QUEUE_URL }).spanAttributes?.['messaging.operation.type']).toBe(
        expected,
      );
    });
  });

  describe('without span streaming', () => {
    it.each([
      ['ReceiveMessage', 'my-queue receive'],
      ['SendMessage', 'my-queue send'],
      ['SendMessageBatch', 'my-queue send'],
    ])('keeps the transaction-mode name for a %s span', (commandName, expected) => {
      setUpClient('static');

      expect(preSpanHook(commandName, { QueueUrl: QUEUE_URL }).spanName).toBe(expected);
    });

    // Interpolating the missing queue would produce the literal name 'undefined receive'.
    it('drops the destination when the QueueUrl is missing', () => {
      setUpClient('static');

      expect(preSpanHook('ReceiveMessage', {}).spanName).toBe('receive');
    });

    it('treats a trailing slash as no queue name rather than an empty one', () => {
      setUpClient('static');

      expect(preSpanHook('ReceiveMessage', { QueueUrl: `${QUEUE_URL}/` }).spanName).toBe('receive');
    });
  });
});
