import type { Event } from '@sentry/types';
import { JSDOM } from 'jsdom';

import { getCurrentHub } from '../../core/src/hub';
import { BrowserProfilingIntegration, PROFILING_EVENT_CACHE, sendProfile } from '../src/integration';

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

  it('does not store event in profiling event cache if context["profile"]["profile_id"] is not present', () => {
    const integration = new BrowserProfilingIntegration();
    const event: Event = {
      contexts: {},
    };
    integration.handleGlobalEvent(event);
    expect(PROFILING_EVENT_CACHE.size).toBe(0);
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
    expect(PROFILING_EVENT_CACHE.size).toBe(20);
    // Evicts the first item in the cache
    expect(PROFILING_EVENT_CACHE.get('profile_id_0')).toBe(undefined);
  });
});
