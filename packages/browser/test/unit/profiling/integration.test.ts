import { getCurrentHub } from '@sentry/browser';
import type { Event } from '@sentry/types';
import { TextDecoder, TextEncoder } from 'util';

// @ts-ignore patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
const patchedEncoder = (!global.window.TextEncoder && (global.window.TextEncoder = TextEncoder)) || true;
// @ts-ignore patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
const patchedDecoder = (!global.window.TextDecoder && (global.window.TextDecoder = TextDecoder)) || true;

import { JSDOM } from 'jsdom';

import { BrowserProfilingIntegration } from '../../../src/profiling/integration';
import { PROFILING_EVENT_CACHE } from '../../../src/profiling/cache';
import { sendProfile } from '../../../src/profiling/sendProfile';

// @ts-ignore store a reference so we can reset it later
const globalDocument = global.document;
// @ts-ignore store a reference so we can reset it later
const globalWindow = global.window;
// @ts-ignore store a reference so we can reset it later
const globalLocation = global.location;

describe('BrowserProfilingIntegration', () => {
  beforeEach(() => {
    // Clear profiling event cache
    PROFILING_EVENT_CACHE.clear();

    const dom = new JSDOM();
    // @ts-ignore need to override global document
    global.document = dom.window.document;
    // @ts-ignore need to override global document
    global.window = dom.window;
    // @ts-ignore need to override global document
    global.location = dom.window.location;
  });

  // Reset back to previous values
  afterEach(() => {
    // @ts-ignore need to override global document
    global.document = globalDocument;
    // @ts-ignore need to override global document
    global.window = globalWindow;
    // @ts-ignore need to override global document
    global.location = globalLocation;
  });

  afterAll(() => {
    // @ts-ignore patch the encoder on the window, else importing JSDOM fails
    patchedEncoder && delete global.window.TextEncoder;
    // @ts-ignore patch the encoder on the window, else importing JSDOM fails
    patchedDecoder && delete global.window.TextDecoder;
  });

  it('does not store event in profiling event cache if context["profile"]["profile_id"] is not present', () => {
    const integration = new BrowserProfilingIntegration();
    const event: Event = {
      contexts: {},
    };
    integration.handleGlobalEvent(event);
    expect(PROFILING_EVENT_CACHE.size()).toBe(0);
  });

  it('stores event in profiling event cache if context["profile"]["profile_id"] is present', () => {
    const integration = new BrowserProfilingIntegration();
    const event: Event = {
      contexts: {
        profile: {
          profile_id: 'profile_id',
        },
      },
    };
    integration.handleGlobalEvent(event);
    expect(PROFILING_EVENT_CACHE.get(event.contexts!.profile!.profile_id as string)).toBe(event);
  });

  it('sending profile evicts it from the LRU cache', () => {
    const hub = getCurrentHub();
    const client: any = {
      getDsn() {
        return {};
      },
      getTransport() {
        return {
          send() {},
        };
      },
    };

    hub.bindClient(client);

    const integration = new BrowserProfilingIntegration();
    const event: Event = {
      type: 'transaction',
      contexts: {
        profile: {
          profile_id: 'profile_id',
        },
      },
    };

    integration.handleGlobalEvent(event);

    sendProfile('profile_id', {
      resources: [],
      samples: [],
      stacks: [],
      frames: [],
      profile_id: 'profile_id',
    });

    expect(PROFILING_EVENT_CACHE.get('profile_id')).toBe(undefined);
  });
});

describe('ProfilingEventCache', () => {
  beforeEach(() => {
    PROFILING_EVENT_CACHE.clear();
  });

  it('caps the size of the profiling event cache', () => {
    for (let i = 0; i <= 21; i++) {
      const integration = new BrowserProfilingIntegration();
      const event: Event = {
        contexts: {
          profile: {
            profile_id: `profile_id_${i}`,
          },
        },
      };
      integration.handleGlobalEvent(event);
    }
    expect(PROFILING_EVENT_CACHE.size()).toBe(20);
    // Evicts the first item in the cache
    expect(PROFILING_EVENT_CACHE.get('profile_id_0')).toBe(undefined);
  });

  it('handles collision by replacing the value', () => {
    PROFILING_EVENT_CACHE.add('profile_id_0', {});
    const second = {};
    PROFILING_EVENT_CACHE.add('profile_id_0', second);

    expect(PROFILING_EVENT_CACHE.get('profile_id_0')).toBe(second);
    expect(PROFILING_EVENT_CACHE.size()).toBe(1);
  });

  it('clears cache', () => {
    PROFILING_EVENT_CACHE.add('profile_id_0', {});
    PROFILING_EVENT_CACHE.clear();
    expect(PROFILING_EVENT_CACHE.size()).toBe(0);
  });
});
