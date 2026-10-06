import { Agent, callable } from 'agents';

/**
 * An Agent the worker entry only ever re-exports (`export { ReExportedAgent } from
 * './reexported-agent'`) — it never binds the class locally at all, so the plugin has to import it
 * under a private name before it can wrap it.
 */
export class ReExportedAgent extends Agent<Env> {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}! (from ReExportedAgent)`;
  }

  async onRequest(): Promise<Response> {
    return Response.json({ agent: 'reexported' });
  }
}
