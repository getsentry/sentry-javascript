import { createTransport } from '@sentry/browser';
import type { Client, ClientOptions } from '@sentry/types';
import { GLOBAL_OBJ, resolvedSyncPromise } from '@sentry/utils';
import { JSDOM } from 'jsdom';

/**
 * Injects DOM properties into node global object.
 *
 * Useful for running tests where some of the tested code applies to @sentry/node and some applies to @sentry/browser
 * (e.g. tests in @sentry/tracing or @sentry/hub). Note that not all properties from the browser `window` object are
 * available.
 *
 * @param properties The names of the properties to add
 */
export function addDOMPropertiesToGlobal(properties: string[]): void {
  // we have to add things into the real global object
  // because there are modules which call GLOBAL_OBJ as they load, which is too early for jest to intervene
  const { window } = new JSDOM('', { url: 'http://dogs.are.great/' });

  properties.forEach(prop => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (GLOBAL_OBJ as any)[prop] = window[prop];
  });
}

/**
 * Returns the symbol with the given description being used as a key in the given object.
 *
 * In the case where there are multiple symbols in the object with the same description, it throws an error.
 *
 * @param obj The object whose symbol-type key you want
 * @param description The symbol's descriptor
 * @returns The first symbol found in the object with the given description, or undefined if not found.
 */
export function getSymbolObjectKeyByName(obj: Record<string | symbol, any>, description: string): symbol | undefined {
  const symbols = Object.getOwnPropertySymbols(obj);

  const matches = symbols.filter(sym => sym.toString() === `Symbol(${description})`);

  if (matches.length > 1) {
    throw new Error(`More than one symbol key found with description '${description}'.`);
  }

  return matches[0] || undefined;
}

export const testOnlyIfNodeVersionAtLeast = (minVersion: number): jest.It => {
  const currentNodeVersion = process.env.NODE_VERSION;

  try {
    if (Number(currentNodeVersion?.split('.')[0]) < minVersion) {
      return it.skip;
    }
  } catch (oO) {
    // we can't tell, so err on the side of running the test
  }

  return it;
};

export function getDefaultBrowserClientOptions(options: Partial<ClientOptions> = {}): ClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}

export function getTestClient(options: Partial<ClientOptions>): Client {
  class TestClient {
    _options: Partial<ClientOptions>;

    constructor(options: Partial<ClientOptions>) {
      this._options = options;
    }

    getOptions(): Partial<ClientOptions> {
      return this._options;
    }
  }

  return new TestClient(options) as unknown as Client;
}
