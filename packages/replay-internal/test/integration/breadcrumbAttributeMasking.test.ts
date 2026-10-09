/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { Breadcrumb } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Replay } from '../../src/integration';
import type { ReplayConfiguration } from '../../src/types';
import { resetSdkMock } from '../mocks/resetSdkMock';

describe('Integration | breadcrumb attribute masking', () => {
  let integration: Replay;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await integration?.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe.each(['data-sentry-component', 'data-sentry-element'])('%s', attribute => {
    it.each([
      {
        label: 'configured masking',
        options: { maskAttributes: [attribute] },
        expected: '******* *** > *** *****',
      },
      {
        label: 'explicit unmasking',
        options: { maskAttributes: [attribute], unmask: ['.sentry-unmask'] },
        expected: 'Account PIN > Pay Alice',
      },
      {
        label: 'default masking',
        options: {},
        expected: 'Account PIN > Pay Alice',
      },
    ])('honors $label for annotated target and ancestor breadcrumbs', async ({ options, expected }) => {
      const breadcrumbs: Breadcrumb[] = [];
      const sdk = await resetSdkMock({
        replayOptions: {
          ...options,
          beforeAddRecordingEvent: event => {
            if (event.data.tag === 'breadcrumb') {
              breadcrumbs.push(event.data.payload);
            }
            return event;
          },
        },
      });
      integration = sdk.integration;
      const parent = document.createElement('div');
      parent.className = 'sentry-unmask';
      parent.setAttribute(attribute, 'Account PIN');
      const target = document.createElement('button');
      target.className = 'sentry-unmask';
      target.setAttribute(attribute, 'Pay Alice');
      parent.appendChild(target);
      const event = new Event('click');
      target.dispatchEvent(event);

      sdk.domHandler({ name: 'click', event });
      await vi.runAllTimersAsync();

      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]?.message).toBe(expected);
    });
  });

  it.each(['click', 'keypress', 'keydown'])('masks target and ancestor attributes in %s breadcrumbs', async name => {
    const breadcrumbs: Breadcrumb[] = [];
    const sdk = await resetSdkMock({
      replayOptions: {
        beforeAddRecordingEvent: event => {
          if (event.data.tag === 'breadcrumb') {
            breadcrumbs.push(event.data.payload);
          }
          return event;
        },
      },
    });
    integration = sdk.integration;
    const parent = document.createElement('div');
    parent.title = 'Account PIN';
    const target = document.createElement('button');
    target.setAttribute('aria-label', 'Pay Alice');
    target.setAttribute('type', 'button');
    parent.appendChild(target);
    const event = new KeyboardEvent(name, { key: 'Escape' });
    target.dispatchEvent(event);

    if (name === 'keydown') {
      sdk.replay['_handleKeyboardEvent'](event);
    } else {
      sdk.domHandler({ name, event });
    }
    await vi.runAllTimersAsync();

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]?.message).toBe('div[title="******* ***"] > button[aria-label="*** *****"][type="button"]');
  });

  it.each([
    {
      label: 'custom attributes with text masking disabled',
      options: { maskAttributes: ['alt', 'name', 'id', 'class'], maskAllText: false },
      expected: 'button#******.*******[aria-label="Pay Alice"][name="*******"][title="Account PIN"][alt="*****"]',
    },
    {
      label: 'explicit unmasking',
      options: { unmask: ['.sentry-unmask'] },
      expected:
        'button#secret.private.sentry-unmask[aria-label="Pay Alice"][name="account"][title="Account PIN"][alt="Alice"]',
    },
    {
      label: 'an empty attribute mask list',
      options: { maskAttributes: [] },
      expected: 'button#secret.private[aria-label="Pay Alice"][name="account"][title="Account PIN"][alt="Alice"]',
    },
  ])('honors $label in click breadcrumbs', async ({ options, expected }) => {
    const breadcrumbs: Breadcrumb[] = [];
    const sdk = await resetSdkMock({
      replayOptions: {
        ...options,
        beforeAddRecordingEvent: event => {
          if (event.data.tag === 'breadcrumb') {
            breadcrumbs.push(event.data.payload);
          }
          return event;
        },
      } satisfies ReplayConfiguration,
    });
    integration = sdk.integration;
    const target = document.createElement('button');
    target.id = 'secret';
    target.className = 'private';
    target.setAttribute('aria-label', 'Pay Alice');
    target.setAttribute('name', 'account');
    target.title = 'Account PIN';
    target.setAttribute('alt', 'Alice');
    if ('unmask' in options) {
      target.classList.add('sentry-unmask');
    }
    const event = new Event('click');
    target.dispatchEvent(event);

    sdk.domHandler({ name: 'click', event });
    await vi.runAllTimersAsync();

    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]?.message).toBe(expected);
  });
});
