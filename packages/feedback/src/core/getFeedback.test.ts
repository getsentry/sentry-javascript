import { getCurrentScope } from '@sentry/core';
import { getFeedback } from './getFeedback';
import { feedbackIntegration } from './integration';
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
    const feedback = feedbackIntegration();

    mockSdk({
      sentryOptions: {
        integrations: [feedback],
      },
    });

    const actual = getFeedback();
    expect(actual).toBeDefined();
    expect(actual === feedback).toBe(true);
  });
});
