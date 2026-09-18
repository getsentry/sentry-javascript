/**
 * @vitest-environment jsdom
 */
import type { Event } from '@sentry/core';
import { createTransport, getCurrentScope, setCurrentClient } from '@sentry/core';
import { render } from '@solidjs/web';
import { createComponent, createMemo, createSignal, flush } from 'solid-js';
import { Errored } from 'solid-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserClient, solidErrorsIntegration } from '../../src/client';
import { DEV, OBSERVE } from 'solid-js';

function clientWith(events: Event[]): BrowserClient {
  const client = new BrowserClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    integrations: [solidErrorsIntegration()],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    beforeSend: event => {
      events.push(event);
      return null;
    },
  });
  setCurrentClient(client);
  client.init();
  return client;
}

describe('solidErrorsIntegration', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('runs against the observe build of solid-js', () => {
    expect(OBSERVE).toBeDefined();
    expect(DEV).toBeUndefined();
  });

  it('reports what an <Errored> boundary catches, once, with the component labels', async () => {
    const events: Event[] = [];
    const client = clientWith(events);
    const [fail, setFail] = createSignal(false);
    const boom = new Error('widget exploded');

    const Widget = () => {
      const view = createMemo(
        () => {
          if (fail()) throw boom;
          return 'ok';
        },
        { name: 'view' },
      );
      return createMemo(() => view());
    };
    const App = () =>
      createComponent(Errored, {
        fallback: () => 'fallback',
        get children() {
          return createComponent(Widget, {}, 'Widget');
        },
      });

    const container = document.createElement('div');
    const dispose = render(() => createComponent(App, {}, 'App'), container);
    flush();
    setFail(true);
    flush();
    await client.flush(100);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.exception?.values?.[0]).toMatchObject({
      value: 'widget exploded',
      mechanism: { type: 'auto.function.solid.error_boundary', handled: true },
    });
    // Where it broke, apart from where it was met.
    expect(event.tags?.['solid.owner']).toBe('<App> › <Errored> › computed › <Widget> › view');
    expect(event.tags?.['solid.boundary']).toBe('<App> › <Errored>');
    expect(event.extra?.['solid.boundaryPath']).toEqual(['<App>', '<Errored>']);
    dispose();
  });
});
