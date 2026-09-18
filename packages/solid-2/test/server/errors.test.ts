import type { Event } from '@sentry/core';
import { createTransport, getCurrentScope, setCurrentClient } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { Errored, renderToString } from '@solidjs/web';
import { createComponent } from 'solid-js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SolidServerErrorsOptions } from '../../src/server';
import { solidServerErrorsIntegration } from '../../src/server';

function clientWith(events: Event[], options?: SolidServerErrorsOptions): NodeClient {
  const client = new NodeClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    integrations: [solidServerErrorsIntegration(options)],
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

const fallback = (err: () => unknown) => String((err() as Error).message);

function throwingApp(error: unknown): () => unknown {
  return () =>
    createComponent(
      () =>
        createComponent(
          Errored,
          {
            fallback,
            get children() {
              throw error;
            },
          },
          'Errored',
        ),
      {},
      'App',
    );
}

describe('solidServerErrorsIntegration', () => {
  beforeEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('reports the error as thrown when an <Errored> renders its fallback, with where it was met', async () => {
    const events: Event[] = [];
    const client = clientWith(events);
    const boom = Object.assign(new Error('connect ECONNREFUSED postgres://app:hunter2@db'), {
      connectionString: 'postgres://app:hunter2@db',
    });

    const html = renderToString(throwingApp(boom));
    await client.flush(100);

    // The wire gets Solid's default policy (generic outside dev); Sentry gets the real one.
    expect(html).not.toContain('hunter2');
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.exception?.values?.[0]).toMatchObject({
      value: 'connect ECONNREFUSED postgres://app:hunter2@db',
      mechanism: { type: 'auto.function.solid.server.render.fallback', handled: true },
    });
    // Thrown in the boundary's own children getter here, so the two coincide.
    expect(event.tags).toMatchObject({
      'solid.kind': 'render',
      'solid.handling': 'fallback',
      'solid.owner': '<App> › <Errored>',
      'solid.boundary_path': '<App> › <Errored>',
    });
    expect(event.tags?.['solid.boundary']).toEqual(expect.any(String));
  });

  it('names the component that threw apart from the boundary that met it', async () => {
    const events: Event[] = [];
    const client = clientWith(events);
    const App = () =>
      createComponent(
        Errored,
        {
          fallback,
          get children() {
            return createComponent(
              () => {
                throw new Error('bad render');
              },
              {},
              'Bad',
            );
          },
        },
        'Errored',
      );
    renderToString(() => createComponent(App, {}, 'App'));
    await client.flush(100);

    expect(events[0]?.tags).toMatchObject({
      'solid.owner': '<App> › <Errored> › <Bad>',
      'solid.boundary_path': '<App> › <Errored>',
    });
  });

  it('mapError decides what the client receives in the error’s place', async () => {
    const events: Event[] = [];
    const client = clientWith(events, {
      mapError: (error, { kind }) => new Error(`${kind} failed (ref ${(error as Error).message.length})`),
    });

    const html = renderToString(throwingApp(new Error('secret detail')));
    await client.flush(100);

    expect(html).toContain('render failed (ref 13)');
    expect(html).not.toContain('secret detail');
    expect(events[0]?.exception?.values?.[0]?.value).toBe('secret detail');
  });

  it('reports once per error object', async () => {
    const events: Event[] = [];
    const client = clientWith(events);
    const boom = new Error('once');
    renderToString(throwingApp(boom));
    renderToString(throwingApp(boom));
    await client.flush(100);
    expect(events).toHaveLength(1);
  });
});
