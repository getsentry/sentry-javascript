/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { TRIGGER_LABEL } from '../../../src/constants';
import { getFeedback } from '../../../src/core/getFeedback';
import { buildFeedbackIntegration } from '../../../src/core/integration';
import { mockSdk } from '../mockSdk';

describe('Actor', () => {
  it('renders the actor button', () => {
    const feedbackIntegration = buildFeedbackIntegration({
      lazyLoadIntegration: vi.fn(),
    });

    const configuredIntegration = feedbackIntegration({});
    mockSdk({
      sentryOptions: {
        integrations: [configuredIntegration],
      },
    });

    const feedback = getFeedback();
    expect(feedback).toBeDefined();

    const actorComponent = feedback!.createWidget();

    expect(actorComponent.el).toBeInstanceOf(HTMLButtonElement);
    expect(actorComponent.el.textContent).toBe(TRIGGER_LABEL);
  });

  it('renders the correct aria label for the button', () => {
    const feedbackIntegration = buildFeedbackIntegration({
      lazyLoadIntegration: vi.fn(),
    });

    const configuredIntegration = feedbackIntegration({});
    mockSdk({
      sentryOptions: {
        integrations: [configuredIntegration],
      },
    });

    const feedback = getFeedback();
    expect(feedback).toBeDefined();

    // aria label is the same as trigger label when the trigger label isn't empty
    const actorDefault = feedback!.createWidget({ triggerLabel: 'Button' });

    expect(actorDefault.el.textContent).toBe('Button');
    expect(actorDefault.el.ariaLabel).toBe('Button');

    // aria label is default text when trigger label is empty and aria isn't configured
    const actorIcon = feedback!.createWidget({ triggerLabel: '' });

    expect(actorIcon.el.textContent).toBe('');
    expect(actorIcon.el.ariaLabel).toBe(TRIGGER_LABEL);

    // aria label is the triggerAriaLabel if it's configured
    const actorAria = feedback!.createWidget({ triggerLabel: 'Button', triggerAriaLabel: 'Aria' });

    expect(actorAria.el.textContent).toBe('Button');
    expect(actorAria.el.ariaLabel).toBe('Aria');
  });

  it('does not throw if removeFromDom() is called when it is not mounted', () => {
    const feedbackIntegration = buildFeedbackIntegration({
      lazyLoadIntegration: vi.fn(),
    });

    const configuredIntegration = feedbackIntegration({});
    mockSdk({
      sentryOptions: {
        integrations: [configuredIntegration],
      },
    });

    const feedback = getFeedback();

    const actorComponent = feedback!.createWidget();

    expect(() => actorComponent.removeFromDom()).not.toThrowError();
    expect(() => actorComponent.removeFromDom()).not.toThrowError();
  });
});
