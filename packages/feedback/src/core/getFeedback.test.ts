import { getCurrentScope } from '@sentry/core';
import { getFeedback } from './getFeedback';
import { buildFeedbackIntegration } from './integration';
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
      lazyLoadIntegration: jest.fn(),
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
