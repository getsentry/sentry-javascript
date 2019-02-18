/** Integration Class Interface */
export interface IntegrationClass<T> {
  new (): T;
  /**
   * Property that holds the integration name
   */
  id: string;
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
  setupOnce(): void;
}
