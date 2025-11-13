/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSpotlightConfig } from '../../src/utils/spotlightConfig';

describe('getSpotlightConfig', () => {
  let originalProcess: typeof globalThis.process | undefined;

  beforeEach(() => {
    originalProcess = globalThis.process;
  });

  afterEach(() => {
    if (originalProcess !== undefined) {
      globalThis.process = originalProcess;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).process;
    }
  });

  it('returns undefined when no environment variables are set', () => {
    globalThis.process = {
      env: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getSpotlightConfig()).toBeUndefined();
  });

  it('returns boolean true when SENTRY_SPOTLIGHT=true', () => {
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: 'true',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getSpotlightConfig()).toBe(true);
  });

  it('returns boolean false when SENTRY_SPOTLIGHT=false', () => {
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: 'false',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getSpotlightConfig()).toBe(false);
  });

  it('returns URL string when SENTRY_SPOTLIGHT is a URL', () => {
    const customUrl = 'http://localhost:9999/stream';
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: customUrl,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getSpotlightConfig()).toBe(customUrl);
  });

  it('parses various truthy values correctly', () => {
    const truthyValues = ['true', '1', 'yes', 'on', 't', 'y', 'TRUE', 'YES'];

    truthyValues.forEach(value => {
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: value,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });
  });

  it('parses various falsy values correctly', () => {
    const falsyValues = ['false', '0', 'no', 'off', 'f', 'n', 'FALSE', 'NO'];

    falsyValues.forEach(value => {
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: value,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(false);
    });
  });

  describe('priority order', () => {
    it('prioritizes SENTRY_SPOTLIGHT over PUBLIC_SENTRY_SPOTLIGHT', () => {
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'true',
          PUBLIC_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes PUBLIC_SENTRY_SPOTLIGHT when SENTRY_SPOTLIGHT is not set', () => {
      globalThis.process = {
        env: {
          PUBLIC_SENTRY_SPOTLIGHT: 'true',
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes NEXT_PUBLIC_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
          VITE_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes VITE_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          VITE_SENTRY_SPOTLIGHT: 'true',
          NUXT_PUBLIC_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes NUXT_PUBLIC_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          NUXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
          REACT_APP_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses REACT_APP_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          REACT_APP_SENTRY_SPOTLIGHT: 'true',
          VUE_APP_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses VUE_APP_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          VUE_APP_SENTRY_SPOTLIGHT: 'true',
          GATSBY_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses GATSBY_SENTRY_SPOTLIGHT when all higher priority vars not set', () => {
      globalThis.process = {
        env: {
          GATSBY_SENTRY_SPOTLIGHT: 'true',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('returns first found value in priority order with URLs', () => {
      const highPriorityUrl = 'http://high-priority:8969/stream';
      const lowPriorityUrl = 'http://low-priority:8969/stream';

      globalThis.process = {
        env: {
          PUBLIC_SENTRY_SPOTLIGHT: highPriorityUrl,
          GATSBY_SENTRY_SPOTLIGHT: lowPriorityUrl,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      expect(getSpotlightConfig()).toBe(highPriorityUrl);
    });
  });

  it('handles missing process object gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).process;

    expect(() => getSpotlightConfig()).not.toThrow();
    expect(getSpotlightConfig()).toBeUndefined();
  });

  it('handles missing process.env gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.process = {} as any;

    expect(() => getSpotlightConfig()).not.toThrow();
    expect(getSpotlightConfig()).toBeUndefined();
  });
});
