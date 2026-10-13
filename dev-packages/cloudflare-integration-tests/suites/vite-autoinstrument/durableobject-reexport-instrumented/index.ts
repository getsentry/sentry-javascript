import { Counter } from './counter';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace;
}

// `Counter` is imported from another module (`./counter`) where it was already
// manually wrapped with `instrumentDurableObjectWithSentry`, then re-exported
// here. The auto-instrument transform runs over this entry and sees
// `export { Counter }`, but nothing in this file reveals that the binding is
// already wrapped, so it emits its wrapper behind a guard
// (`_INTERNAL_wrapUnlessInstrumented`) that returns the manual wrap unchanged
// instead of nesting. The plain default export below is still auto-wrapped
// with `withSentry`.
export { Counter };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/increment') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      return stub.fetch(new Request('https://do/increment'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
