import { getCurrentScope } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeedback } from '../../src/core/getFeedback';
import { buildFeedbackIntegration } from '../../src/core/integration';
import { mockSdk } from './mockSdk';

describe('getFeedback', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('works without a client', () => {
    const actual = getFeedback();
    expect(actual).toBeUndefined();
  });

  it('works with a client without Feedback', () => {
    mockSdk({
      sentryOptions: {
        integrations: [],
      },
    });

    const actual = getFeedback();
    expect(actual).toBeUndefined();
  });

  it('works with a client with Feedback', () => {
    const feedbackIntegration = buildFeedbackIntegration({
      lazyLoadIntegration: vi.fn(),
    });

    const configuredIntegration = feedbackIntegration({});
    mockSdk({
      sentryOptions: {
        integrations: [configuredIntegration],
      },
    });

    const actual = getFeedback();
    expect(actual).toBeDefined();
    expect(actual === configuredIntegration).toBe(true);

    // has correct type
    expect(typeof actual?.attachTo).toBe('function');
    expect(typeof actual?.createWidget).toBe('function');
    expect(typeof actual?.remove).toBe('function');
  });
});
