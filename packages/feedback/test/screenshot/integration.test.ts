/**
 * @vitest-environment jsdom
 */
import type { FeedbackInternalOptions, FeedbackScreenshotIntegration } from '@sentry/core';
import { h, render } from 'preact';
import * as hooks from 'preact/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackScreenshotIntegration } from '../../src/screenshot/integration';

const options = {
  addScreenshotButtonLabel: 'Add a screenshot',
  id: 'sentry-feedback',
  removeHighlightText: 'Remove',
  styleNonce: undefined,
} as FeedbackInternalOptions;

function createInput(): ReturnType<FeedbackScreenshotIntegration['createInput']> {
  return feedbackScreenshotIntegration().createInput({
    h,
    hooks,
    dialog: { el: document.createElement('div') } as unknown as Parameters<
      FeedbackScreenshotIntegration['createInput']
    >[0]['dialog'],
    options,
  });
}

describe('feedback screenshot upload fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it('keeps the input visible when display capture is rejected', async () => {
    const onError = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError')) },
    });
    const input = createInput();
    const host = document.createElement('div');

    render(h(input.input, { onError }), host);

    await vi.waitFor(() => expect(host.querySelector('input[type="file"]')).not.toBeNull());
    expect(onError).not.toHaveBeenCalled();
    expect(await input.value()).toBeUndefined();
  });

  it('returns the selected image as an attachment', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError')) },
    });
    const input = createInput();
    const host = document.createElement('div');

    render(h(input.input, { onError: vi.fn() }), host);
    const fileInput = await vi.waitFor(() => {
      const element = host.querySelector<HTMLInputElement>('input[type="file"]');
      expect(element).not.toBeNull();
      return element as HTMLInputElement;
    });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'bug.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(async () => {
      const attachment = await input.value();
      expect(attachment).toEqual({
        data: new Uint8Array([137, 80, 78, 71]),
        filename: 'bug.png',
        contentType: 'image/png',
      });
    });
  });

  it('clears a selected file when the screenshot input is removed', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError')) },
    });
    const input = createInput();
    const host = document.createElement('div');

    render(h(input.input, { onError: vi.fn() }), host);
    const fileInput = await vi.waitFor(() => {
      const element = host.querySelector<HTMLInputElement>('input[type="file"]');
      expect(element).not.toBeNull();
      return element as HTMLInputElement;
    });
    const file = new File(['old screenshot'], 'old.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(input.value()).resolves.toBeDefined());

    render(null, host);

    await expect(input.value()).resolves.toBeUndefined();
  });
});
