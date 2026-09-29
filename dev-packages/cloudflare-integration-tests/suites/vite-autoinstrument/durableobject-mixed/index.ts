import * as Sentry from '@sentry/cloudflare';
import { DurableObject } from 'cloudflare:workers';

interface Env {
  SENTRY_DSN: string;
  MANUAL: DurableObjectNamespace;
  AUTO: DurableObjectNamespace;
}

class ManualImpl extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    // Touch storage so the instrumented DO emits an
    // `auto.db.cloudflare.durable_object` span the test can fingerprint.
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ kind: 'manual', count: current });
  }
}

// Manually wrapped — the transform must leave this alone.
export const Manual = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN, tracesSampleRate: 1.0 }),
  ManualImpl,
);

// Plain inline export — the transform must wrap this one. Both classes are
// configured in wrangler, so this exercises wrapping only the unwrapped class
// while skipping the manually wrapped sibling in the same file.
export class Auto extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    // Touch storage so the instrumented DO emits an
    // `auto.db.cloudflare.durable_object` span the test can fingerprint.
    const current = ((await this.ctx.storage.get<number>('count')) ?? 0) + 1;
    await this.ctx.storage.put('count', current);
    return Response.json({ kind: 'auto', count: current });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/manual') {
      const stub = env.MANUAL.get(env.MANUAL.idFromName('e2e-manual'));
      return stub.fetch(new Request('https://do/manual'));
    }

    if (url.pathname === '/auto') {
      const stub = env.AUTO.get(env.AUTO.idFromName('e2e-auto'));
      return stub.fetch(new Request('https://do/auto'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
