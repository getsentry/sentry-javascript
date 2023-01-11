import { WINDOW } from '@sentry/browser';
import type { Event, EventProcessor, Hub, Integration, IntegrationClass } from '@sentry/types';

import type { Item } from '../src/offline';
import { Offline } from '../src/offline';

// mock localforage methods
jest.mock('localforage', () => ({
  createInstance(_options: { name: string }): any {
    let items: Item[] = [];

    return {
      async getItem(key: string): Promise<Item | void> {
        return items.find(item => item.key === key);
      },
      async iterate(callback: (event: Event, key: string, index: number) => void): Promise<void> {
        items.forEach((item, index) => {
          callback(item.value, item.key, index);
        });
      },
      async length(): Promise<number> {
        return items.length;
      },
      async removeItem(key: string): Promise<void> {
        items = items.filter(item => item.key !== key);
      },
      async setItem(key: string, value: Event): Promise<void> {
        items.push({
          key,
          value,
        });
      },
    };
  },
}));

let integration: Offline;

// We need to mock the WINDOW object so we can modify 'navigator.online' which is readonly
jest.mock('@sentry/utils', () => {
  const originalModule = jest.requireActual('@sentry/utils');

  return {
    ...originalModule,
    get GLOBAL_OBJ() {
      return {
        addEventListener: (_windowEvent: any, callback: any) => {
          eventListeners.push(callback);
        },
        navigator: {
          onLine: false,
        },
      };
    },
  };
});

describe('Offline', () => {
  describe('when app is online', () => {
    beforeEach(() => {
      (WINDOW.navigator as any).onLine = true;

      initIntegration();
    });

    it('does not store events in offline store', async () => {
      setupOnce();
      processEvents();

      expect(await integration.offlineEventStore.length()).toEqual(0);
    });

    describe('when there are already events in the cache from a previous offline session', () => {
      beforeEach(async () => {
        const event = { message: 'previous event' };

        await integration.offlineEventStore.setItem('previous', event);
      });

      it('sends stored events', async () => {
        expect(await integration.offlineEventStore.length()).toEqual(1);

        setupOnce();
        processEvents();

        expect(await integration.offlineEventStore.length()).toEqual(0);
      });
    });
  });

  describe('when app is offline', () => {
    beforeEach(() => {
      (WINDOW.navigator as any).onLine = false;
    });

    it('stores events in offline store', async () => {
      initIntegration();
      setupOnce();
      prepopulateEvents(1);
      processEvents();

      expect(await integration.offlineEventStore.length()).toEqual(1);
    });

    it('enforces a default of 30 maxStoredEvents', done => {
      initIntegration();
      setupOnce();
      prepopulateEvents(50);
      processEvents();

      setImmediate(async () => {
        // allow background promises to finish resolving
        expect(await integration.offlineEventStore.length()).toEqual(30);
        done();
      });
    });

    it('does not purge events when below the maxStoredEvents threshold', done => {
      initIntegration();
      setupOnce();
      prepopulateEvents(5);
      processEvents();

      setImmediate(async () => {
        // allow background promises to finish resolving
        expect(await integration.offlineEventStore.length()).toEqual(5);
        done();
      });
    });

    describe('when maxStoredEvents is supplied', () => {
      it('respects the configuration', done => {
        initIntegration({ maxStoredEvents: 5 });
        setupOnce();
        prepopulateEvents(50);
        processEvents();

        setImmediate(async () => {
          // allow background promises to finish resolving
          expect(await integration.offlineEventStore.length()).toEqual(5);
          done();
        });
      });
    });

    describe('when connectivity is restored', () => {
      it('sends stored events', async () => {
        initIntegration();
        setupOnce();
        prepopulateEvents(1);
        processEvents();
        processEventListeners();

        expect(await integration.offlineEventStore.length()).toEqual(0);
      });
    });
  });
});

let eventListeners: any[];
let eventProcessors: EventProcessor[];
let events: Event[];

/** JSDoc */
function addGlobalEventProcessor(callback: EventProcessor): void {
  eventProcessors.push(callback);
}

/** JSDoc */
function getCurrentHub(): Hub {
  return {
    captureEvent(_event: Event): string {
      return 'an-event-id';
    },
    getIntegration<T extends Integration>(_integration: IntegrationClass<T>): T | null {
      // pretend integration is enabled
      return {} as T;
    },
  } as Hub;
}

/** JSDoc */
function initIntegration(options: { maxStoredEvents?: number } = {}): void {
  eventListeners = [];
  eventProcessors = [];
  events = [];

  integration = new Offline(options);
}

/** JSDoc */
function prepopulateEvents(count: number = 1): void {
  for (let i = 0; i < count; i++) {
    events.push({
      message: 'There was an error!',
      timestamp: new Date().getTime(),
    });
  }
}

/** JSDoc */
function processEventListeners(): void {
  eventListeners.forEach(listener => {
    listener();
  });
}

/** JSDoc */
function processEvents(): void {
  eventProcessors.forEach(processor => {
    events.forEach(event => {
      processor(event, {}) as Event | null;
    });
  });
}

/** JSDoc */
function setupOnce(): void {
  integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
}
