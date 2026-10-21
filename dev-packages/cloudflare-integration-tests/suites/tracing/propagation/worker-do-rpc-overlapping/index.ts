import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  COUNTER: DurableObjectNamespace<Counter>;
}

// Nothing is wrapped manually, the Vite plugin wraps both exports and enables RPC trace
// propagation for `COUNTER`.
export class Counter extends DurableObject<Env> {
  private calls = 0;
  private releaseCalls: () => void = () => {};
  private readonly allCallsArrived = new Promise<void>(resolve => {
    this.releaseCalls = resolve;
  });

  // Each call waits until the other one has arrived, so both are in flight at the same time.
  async work(label: string): Promise<string> {
    this.calls++;
    if (this.calls === 2) {
      this.releaseCalls();
    }

    await this.allCallsArrived;
    Sentry.getActiveSpan()?.setAttribute('test.label', label);
    return label;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/overlapping') {
      const stub = env.COUNTER.get(env.COUNTER.idFromName('e2e'));
      const labels = await Promise.all([stub.work('a'), stub.work('b')]);
      return new Response(labels.join(','));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
