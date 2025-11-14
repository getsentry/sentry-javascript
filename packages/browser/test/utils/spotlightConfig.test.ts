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
      delete (globalThis as typeof globalThis & { process?: NodeJS.Process }).process;
    }
  });

  it('returns undefined when no environment variables are set', () => {
    globalThis.process = {
      env: {},
    } as NodeJS.Process;

    expect(getSpotlightConfig()).toBeUndefined();
  });

  it('returns boolean true when SENTRY_SPOTLIGHT=true', () => {
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: 'true',
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getSpotlightConfig()).toBe(true);
  });

  it('returns boolean false when SENTRY_SPOTLIGHT=false', () => {
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: 'false',
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getSpotlightConfig()).toBe(false);
  });

  it('returns URL string when SENTRY_SPOTLIGHT is a URL', () => {
    const customUrl = 'http://localhost:9999/stream';
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: customUrl,
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getSpotlightConfig()).toBe(customUrl);
  });

  it('returns undefined when SENTRY_SPOTLIGHT is an empty string', () => {
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: '',
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getSpotlightConfig()).toBeUndefined();
  });

  it('returns undefined when SENTRY_SPOTLIGHT is whitespace only', () => {
    globalThis.process = {
      env: {
        SENTRY_SPOTLIGHT: '   ',
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getSpotlightConfig()).toBeUndefined();
  });

  it('parses various truthy values correctly', () => {
    const truthyValues = ['true', '1', 'yes', 'on', 't', 'y', 'TRUE', 'YES'];

    truthyValues.forEach(value => {
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: value,
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });
  });

  it('parses various falsy values correctly', () => {
    const falsyValues = ['false', '0', 'no', 'off', 'f', 'n', 'FALSE', 'NO'];

    falsyValues.forEach(value => {
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: value,
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(false);
    });
  });

  describe('priority order', () => {
    it('prioritizes PUBLIC_SENTRY_SPOTLIGHT over SENTRY_SPOTLIGHT', () => {
      globalThis.process = {
        env: {
          PUBLIC_SENTRY_SPOTLIGHT: 'true',
          SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes PUBLIC_SENTRY_SPOTLIGHT when SENTRY_SPOTLIGHT is not set', () => {
      globalThis.process = {
        env: {
          PUBLIC_SENTRY_SPOTLIGHT: 'true',
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes NEXT_PUBLIC_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
          VITE_SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes VITE_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          VITE_SENTRY_SPOTLIGHT: 'true',
          NUXT_PUBLIC_SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('prioritizes NUXT_PUBLIC_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          NUXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
          REACT_APP_SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses REACT_APP_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          REACT_APP_SENTRY_SPOTLIGHT: 'true',
          VUE_APP_SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses VUE_APP_SENTRY_SPOTLIGHT when higher priority vars not set', () => {
      globalThis.process = {
        env: {
          VUE_APP_SENTRY_SPOTLIGHT: 'true',
          GATSBY_SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses GATSBY_SENTRY_SPOTLIGHT when all higher priority vars not set', () => {
      globalThis.process = {
        env: {
          GATSBY_SENTRY_SPOTLIGHT: 'true',
          SENTRY_SPOTLIGHT: 'false',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('uses SENTRY_SPOTLIGHT as fallback when no framework-specific vars are set', () => {
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'true',
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(true);
    });

    it('returns first found value in priority order with URLs', () => {
      const highPriorityUrl = 'http://high-priority:8969/stream';
      const lowPriorityUrl = 'http://low-priority:8969/stream';

      globalThis.process = {
        env: {
          PUBLIC_SENTRY_SPOTLIGHT: highPriorityUrl,
          GATSBY_SENTRY_SPOTLIGHT: lowPriorityUrl,
        } as Record<string, string>,
      } as NodeJS.Process;

      expect(getSpotlightConfig()).toBe(highPriorityUrl);
    });

    it('prioritizes framework-specific URL over SENTRY_SPOTLIGHT URL (Docker Compose scenario)', () => {
      // Simulates Docker Compose setup where:
      // - SENTRY_SPOTLIGHT is set for backend services with Docker hostname
      // - Framework-specific var is set for frontend with localhost
      const dockerHostUrl = 'http://host.docker.internal:8969/stream';
      const localhostUrl = 'http://localhost:8969/stream';

      globalThis.process = {
        env: {
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: localhostUrl,
          SENTRY_SPOTLIGHT: dockerHostUrl,
        } as Record<string, string>,
      } as NodeJS.Process;

      // Framework-specific var should be used, not SENTRY_SPOTLIGHT
      expect(getSpotlightConfig()).toBe(localhostUrl);
    });

    it('uses SENTRY_SPOTLIGHT URL when no framework-specific vars are set (remote Spotlight)', () => {
      const remoteUrl = 'http://remote-spotlight.example.com:8969/stream';

      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: remoteUrl,
        } as Record<string, string>,
      } as NodeJS.Process;

      // Should use SENTRY_SPOTLIGHT as fallback
      expect(getSpotlightConfig()).toBe(remoteUrl);
    });
  });

  it('handles missing process object gracefully', () => {
    delete (globalThis as typeof globalThis & { process?: NodeJS.Process }).process;

    expect(() => getSpotlightConfig()).not.toThrow();
    expect(getSpotlightConfig()).toBeUndefined();
  });

  it('handles missing process.env gracefully', () => {
    globalThis.process = {} as NodeJS.Process;

    expect(() => getSpotlightConfig()).not.toThrow();
    expect(getSpotlightConfig()).toBeUndefined();
  });
});
