import { Agent, callable } from 'agents';

/**
 * An Agent declared outside the worker entry, which imports it and exports it again by specifier
 * (`import { ImportedAgent } from './imported-agent'; export { ImportedAgent }`). The entry has no
 * local class to rename, so the plugin has to re-point the export at a wrapper binding instead.
 */
export class ImportedAgent extends Agent<Env> {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}! (from ImportedAgent)`;
  }

  async onRequest(): Promise<Response> {
    return Response.json({ agent: 'imported' });
  }
}
