import { setCurrentClient } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SnsServiceExtension } from '../../src/integrations/aws-sdk/services/sns';
import type { RequestMetadata } from '../../src/integrations/aws-sdk/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

function setUpClient(traceLifecycle: 'stream' | 'static'): void {
  const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle, tracesSampleRate: 1 }));
  setCurrentClient(client);
  client.init();
}

function publishSpanName(commandInput: Record<string, unknown>): string | undefined {
  const metadata: RequestMetadata = new SnsServiceExtension().requestPreSpanHook({
    serviceName: 'SNS',
    commandName: 'Publish',
    commandInput,
  });
  return metadata.spanName;
}

const TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:my-topic';
// A platform endpoint, whose ARN ends in a per-device id.
const ENDPOINT_ARN = 'arn:aws:sns:us-east-1:123456789012:endpoint/GCM/myapp/5e3e9847-3183-3f18-a7e8-671c3a57d4b3';

describe('SnsServiceExtension span naming', () => {
  afterEach(() => {
    setCurrentClient(undefined as never);
  });

  describe('with span streaming', () => {
    it('names a topic publish with the operation before the destination', () => {
      setUpClient('stream');

      expect(publishSpanName({ TopicArn: TOPIC_ARN, Message: 'Hello' })).toBe('send my-topic');
    });

    it('drops a platform-endpoint destination, which ends in a per-device id', () => {
      setUpClient('stream');

      expect(publishSpanName({ TargetArn: ENDPOINT_ARN, Message: 'Hello' })).toBe('send');
    });

    it('drops the destination when the command names none', () => {
      setUpClient('stream');

      expect(publishSpanName({ Message: 'Hello' })).toBe('send');
    });

    it('never puts the raw phone number in the name', () => {
      setUpClient('stream');

      const spanName = publishSpanName({ PhoneNumber: '+15551234567', Message: 'Hello' });

      expect(spanName).toBe('send phone_number');
      expect(spanName).not.toContain('5551234567');
    });
  });

  it('reports the operation type it names the span after', () => {
    setUpClient('stream');

    const metadata = new SnsServiceExtension().requestPreSpanHook({
      serviceName: 'SNS',
      commandName: 'Publish',
      commandInput: { TopicArn: TOPIC_ARN, Message: 'Hello' },
    });

    expect(metadata.spanAttributes?.['messaging.operation.type']).toBe('send');
  });

  describe('without span streaming', () => {
    it.each([
      [{ TopicArn: TOPIC_ARN }, 'my-topic send'],
      [{ TargetArn: ENDPOINT_ARN }, 'endpoint/GCM/myapp/5e3e9847-3183-3f18-a7e8-671c3a57d4b3 send'],
      [{ PhoneNumber: '+15551234567' }, 'phone_number send'],
      [{}, 'send'],
    ])('keeps the transaction-mode name for %o', (commandInput, expected) => {
      setUpClient('static');

      expect(publishSpanName({ ...commandInput, Message: 'Hello' })).toBe(expected);
    });
  });
});
