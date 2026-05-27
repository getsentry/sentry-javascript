/**
 * @vitest-environment jsdom
 */

import { normalize, setNormalizeStringifier } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../src/sdk';

const PUBLIC_DSN = 'https://username@domain/123';

// The React SDK's `init()` wraps the browser-side `normalizeStringifyValue` (registered
// via `setNormalizeStringifier`) with a SyntheticEvent check on top. These tests exercise
// the composition end-to-end via `normalize()` (React-shaped values are collapsed here;
// non-React values fall through to the browser variant and finally to core).
describe('@sentry/react init() normalize stringifier', () => {
  beforeEach(() => {
    init({
      dsn: PUBLIC_DSN,
      defaultIntegrations: false,
      integrations: [],
    });
  });

  afterEach(() => {
    setNormalizeStringifier(undefined);
  });

  it("collapses React SyntheticEvent-like objects to '[SyntheticEvent]'", () => {
    const synthetic = {
      nativeEvent: 'wat',
      preventDefault: 'wat',
      stopPropagation: 'wat',
    };
    expect(normalize({ e: synthetic })).toEqual({ e: '[SyntheticEvent]' });
  });

  it('still delegates HTMLElement rendering to the browser stringifier underneath', () => {
    const button = document.createElement('button');
    button.id = 'submit';
    expect(normalize({ el: button })).toEqual({ el: '[HTMLElement: button#submit]' });
  });

  it('still delegates `document` to the browser stringifier underneath', () => {
    expect(normalize({ d: document })).toEqual({ d: '[Document]' });
  });

  it('does not collapse plain objects that lack the SyntheticEvent shape', () => {
    expect(normalize({ o: { nativeEvent: 'x' } })).toEqual({ o: { nativeEvent: 'x' } });
    expect(normalize({ o: { preventDefault: 'fn', stopPropagation: 'fn' } })).toEqual({
      o: { preventDefault: 'fn', stopPropagation: 'fn' },
    });
  });

  it('does not intercept primitives or regular objects', () => {
    expect(normalize({ s: 'string', n: 42, o: { foo: 'bar' } })).toEqual({
      s: 'string',
      n: 42,
      o: { foo: 'bar' },
    });
  });
});
