/**
 * @vitest-environment jsdom
 */

import { normalize, setAsyncContextStrategy } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../src';

const PUBLIC_DSN = 'https://username@domain/123';

// The Vue SDK's `init()` wraps the browser-side `normalizeStringifyValue` on the
// async-context strategy with a Vue check on top. These tests exercise the wrapped
// stringifier end-to-end through `normalize()` so we catch any breakage in the
// composition (Vue value handled here; non-Vue values fall through to the browser
// variant; non-DOM/non-Vue values fall through to core's defaults).
describe('@sentry/vue init() normalize stringifier', () => {
  beforeEach(() => {
    Sentry.init({
      dsn: PUBLIC_DSN,
      defaultIntegrations: false,
      integrations: [],
    });
  });

  afterEach(() => {
    // Reset the async-context strategy so subsequent test files start clean.
    setAsyncContextStrategy(undefined);
  });

  it("collapses Vue 3 component instances (`__isVue`) to '[VueViewModel]'", () => {
    expect(normalize({ vm: { __isVue: true, $el: {}, $data: {} } })).toEqual({ vm: '[VueViewModel]' });
  });

  it("collapses Vue 2 component instances (`_isVue`) to '[VueViewModel]'", () => {
    expect(normalize({ vm: { _isVue: true, $el: {}, $data: {} } })).toEqual({ vm: '[VueViewModel]' });
  });

  it("collapses Vue 3 VNodes (`__v_isVNode`) to '[VueVNode]'", () => {
    expect(normalize({ node: { __v_isVNode: true, type: {}, props: {} } })).toEqual({ node: '[VueVNode]' });
  });

  it('still delegates HTMLElement rendering to the browser stringifier underneath', () => {
    const div = document.createElement('div');
    div.classList.add('content');
    expect(normalize({ el: div })).toEqual({ el: '[HTMLElement: div.content]' });
  });

  it('still delegates `document` to the browser stringifier underneath', () => {
    expect(normalize({ d: document })).toEqual({ d: '[Document]' });
  });

  it('does not intercept plain objects or primitives', () => {
    expect(normalize({ s: 'string', n: 42, o: { foo: 'bar' } })).toEqual({
      s: 'string',
      n: 42,
      o: { foo: 'bar' },
    });
  });
});
