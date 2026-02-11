import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrivacyOptions } from '../../../src/util/getPrivacyOptions';

describe('Unit | util | getPrivacyOptions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('has correct default options', () => {
    expect(
      getPrivacyOptions({
        mask: ['.custom-mask'],
        unmask: ['.custom-unmask'],
        block: ['.custom-block'],
        unblock: ['.custom-unblock'],
        ignore: ['.custom-ignore'],
      }),
    ).toMatchInlineSnapshot(`
      {
        "blockSelector": ".custom-block,.sentry-block,[data-sentry-block],base,iframe[srcdoc]:not([src])",
        "ignoreSelector": ".custom-ignore,.sentry-ignore,[data-sentry-ignore],input[type="file"]",
        "maskTextSelector": ".custom-mask,.sentry-mask,[data-sentry-mask]",
        "unblockSelector": ".custom-unblock",
        "unmaskTextSelector": ".custom-unmask",
      }
    `);
  });
});
