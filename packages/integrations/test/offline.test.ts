import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import * as utils from '@sentry/utils';

import { Offline } from '../src/offline';

// mock localforage methods
jest.mock('localforage', () => ({
  createInstance(_options: { name: string }): any {
    let items: { key: string; value: Event }[] = [];

    return {
      async getItem(key: string): Event {
        return items.find(item => item.key === key);
      },
      async iterate(callback: () => void): void {
        items.forEach((item, index) => {
          callback(item.value, item.key, index);
        });
      },
      async length(): number {
        return items.length;
      },
      async removeItem(key: string): void {
        items = items.filter(item => item.key !== key);
      },
      async setItem(key: string, value: Event): void {
        items.push({
          key,
          value,
        });
      },
    };
  },
}));

let integration: Integration;
let online: boolean;

describe('Offline', () => {
  describe('when app is online', () => {
    beforeEach(() => {
      online = true;

      initIntegration();
    });

    it('does not store events in offline store', async () => {
      setupOnce();
      processEvents();

      expect(await integration.offlineEventStore.length()).toEqual(0);
    });

    describe('when there are already events in the cache from a previous offline session', () => {
      beforeEach(done => {
        const event = { message: 'previous event' };

        integration.offlineEventStore
          .setItem('previous', event)
          .then(() => {
            done();
          })
          .catch(error => error);
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
      online = false;
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
      it('sends stored events', async done => {
        initIntegration();
        setupOnce();
        prepopulateEvents(1);
        processEvents();
        processEventListeners();

        expect(await integration.offlineEventStore.length()).toEqual(0);

        setImmediate(done);
      });
    });
  });
});

let eventListeners: any[];
let eventProcessors: EventProcessor[];
let events: Event[];

/** JSDoc */
function addGlobalEventProcessor(callback: () => void): void {
  eventProcessors.push(callback);
}

/** JSDoc */
function getCurrentHub(): Hub {
  return {
    captureEvent(_event: Event): string {
      return 'an-event-id';
    },
    getIntegration(_integration: Integration): any {
      // pretend integration is enabled
      return true;
    },
  };
}

/** JSDoc */
function initIntegration(options: { maxStoredEvents?: number } = {}): void {
  eventListeners = [];
  eventProcessors = [];
  events = [];

  utils.getGlobalObject = jest.fn(() => ({
    addEventListener: (_windowEvent, callback) => {
      eventListeners.push(callback);
    },
    navigator: {
      onLine: online,
    },
  }));

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
      processor(event) as Event | null;
    });
  });
}

/** JSDoc */
function setupOnce(): void {
  integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
}
