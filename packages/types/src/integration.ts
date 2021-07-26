import { EventProcessor } from './eventprocessor';
import { Hub } from './hub';

/**
 * Integration class interface. Note that this is separate from the {@link Integration} interface, which is for
 * instances of the class described by this interface.
 */
export interface IntegrationClass<T = Integration> {
  /**
   * Property that holds the integration name
   */
  id: string;

  new (...args: any[]): T;
}

/**
 * Interface for instances of the `Integration` class. Note that this is separate from the {@link IntegrationClass}
 * interface.
 */
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
}
