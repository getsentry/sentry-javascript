/**
 * @vitest-environment jsdom
 */
import { getCurrentScope } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeedbackIntegration } from '../../src/core/integration';
import { mockSdk } from './mockSdk';

describe('setTheme', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
    document.body.innerHTML = '';
  });

  it('updates colorScheme and replaces the stylesheet in the shadow DOM', () => {
    const feedbackIntegration = buildFeedbackIntegration({ lazyLoadIntegration: vi.fn() });
    const integration = feedbackIntegration({ colorScheme: 'light', autoInject: false });
    mockSdk({ sentryOptions: { integrations: [integration] } });

    // Force shadow DOM creation
    integration.createWidget();

    const host = document.querySelector('#sentry-feedback') as HTMLElement;
    const shadow = host?.shadowRoot;
    expect(shadow).toBeTruthy();

    // Verify initial light scheme
    const initialStyle = shadow?.querySelector('style');
    expect(initialStyle?.textContent).toContain('color-scheme: only light');

    // Switch to dark
    integration.setTheme('dark');

    const updatedStyle = shadow?.querySelector('style');
    expect(updatedStyle?.textContent).toContain('color-scheme: only dark');
  });

  it("setTheme('system') sets system mode", () => {
    const feedbackIntegration = buildFeedbackIntegration({ lazyLoadIntegration: vi.fn() });
    const integration = feedbackIntegration({ colorScheme: 'light', autoInject: false });
    mockSdk({ sentryOptions: { integrations: [integration] } });

    integration.createWidget();

    integration.setTheme('system');

    const host = document.querySelector('#sentry-feedback') as HTMLElement;
    const shadow = host?.shadowRoot;
    const style = shadow?.querySelector('style');
    // System mode uses a media query for dark, not a forced color-scheme at the :host level
    expect(style?.textContent).toContain('prefers-color-scheme');
    // Should not force light color scheme
    expect(style?.textContent).not.toContain('color-scheme: only light');
  });

  it('does not throw when setTheme is called before shadow DOM is created', () => {
    const feedbackIntegration = buildFeedbackIntegration({ lazyLoadIntegration: vi.fn() });
    const integration = feedbackIntegration({ colorScheme: 'light', autoInject: false });
    mockSdk({ sentryOptions: { integrations: [integration] } });

    // Call setTheme before any widget is created
    expect(() => integration.setTheme('dark')).not.toThrow();

    // Now create a widget — it should pick up the updated colorScheme
    integration.createWidget();

    const host = document.querySelector('#sentry-feedback') as HTMLElement;
    const shadow = host?.shadowRoot;
    const style = shadow?.querySelector('style');
    expect(style?.textContent).toContain('color-scheme: only dark');
  });

  it('replaces (not accumulates) style elements on multiple setTheme calls', () => {
    const feedbackIntegration = buildFeedbackIntegration({ lazyLoadIntegration: vi.fn() });
    const integration = feedbackIntegration({ colorScheme: 'light', autoInject: false });
    mockSdk({ sentryOptions: { integrations: [integration] } });

    integration.createWidget();

    const host = document.querySelector('#sentry-feedback') as HTMLElement;
    const shadow = host?.shadowRoot;
    const countAfterCreate = shadow?.querySelectorAll('style').length ?? 0;

    // Multiple setTheme calls should not accumulate additional style elements
    integration.setTheme('dark');
    integration.setTheme('light');
    integration.setTheme('system');

    expect(shadow?.querySelectorAll('style').length).toBe(countAfterCreate);
  });
});
