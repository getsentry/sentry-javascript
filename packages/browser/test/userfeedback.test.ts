import { describe, expect, test } from 'vitest';
import { createUserFeedbackEnvelope } from '../src/userfeedback';

describe('userFeedback', () => {
  test('creates user feedback envelope header', () => {
    const envelope = createUserFeedbackEnvelope(
      {
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      },
      {
        metadata: {
          sdk: {
            name: 'testSdkName',
            version: 'testSdkVersion',
          },
        },
        tunnel: 'testTunnel',
        dsn: {
          host: 'testHost',
          projectId: 'testProjectId',
          protocol: 'http',
        },
      },
    );

    expect(envelope[0]).toEqual({
      dsn: 'http://undefined@testHost/undefinedtestProjectId',
      event_id: 'testEvent123',
      sdk: {
        name: 'testSdkName',
        version: 'testSdkVersion',
      },
      sent_at: expect.any(String),
    });
  });

  test('creates user feedback envelope item', () => {
    const envelope = createUserFeedbackEnvelope(
      {
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      },
      {
        metadata: undefined,
        tunnel: undefined,
        dsn: undefined,
      },
    );

    expect(envelope[1]).toEqual([
      [
        {
          type: 'user_report',
        },
        {
          comments: 'Test Comments',
          email: 'test@email.com',
          name: 'Test User',
          event_id: 'testEvent123',
        },
      ],
    ]);
  });
});
