import { Context } from './context';

/**
 * State context describes the state of the application (e.g.: Redux store object).
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#state-context
 */
export interface StateContext extends Context {
  /**
   *
   */
  state: StateContextState;
}

export interface StateContextState {
  /**
   * Type for naming the state library (e.g.: Redux, MobX, Vuex).
   */
  type?: string;

  /**
   * Value that holds the state object.
   */
  value: Record<string, unknown>;
}
