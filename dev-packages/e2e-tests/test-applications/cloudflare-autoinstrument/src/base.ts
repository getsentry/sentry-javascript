import { Agent } from 'agents';

/**
 * An Agent base class living outside the worker entry. `DerivedAgent` in
 * `index.ts` extends this, so the plugin only learns it is an Agent by
 * following the import into this module and resolving `MyBase -> Agent`.
 */
export class MyBase extends Agent<Env> {
  async onRequest(): Promise<Response> {
    return Response.json({ agent: 'derived' });
  }
}
