import type { Client } from './client';
import type { Event, EventHint } from './event';
import type { EventProcessor } from './eventprocessor';
import type { Hub } from './hub';

/** Integration Class Interface */
export interface IntegrationClass<T> {
  /**
   * Property that holds the integration name
   */
  id: string;

  new (...args: any[]): T;
}

/** Integration interface */
export interface Integration {
  /**
   * Returns {@link IntegrationClass.id}
   */
  name: string;

  /**
   * Sets the integration up only once.
   * This takes no options on purpose, options should be passed in the constructor
   */
  setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void;

  /**
   * An optional hook that allows to preprocess an event _before_ it is passed to all other event processors.
   */
  preprocessEvent?(event: Event, hint: EventHint | undefined, client: Client): void;

  /**
   * An optional hook that allows to process an event.
   * Return `null` to drop the event, or mutate the event & return it.
   */
  processEvent?(event: Event, hint: EventHint | undefined, client: Client): Event | null | PromiseLike<Event | null>;
}
