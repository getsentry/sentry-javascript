import { type Integration, setConversationId } from '@sentry/core';
import { eveIntegration } from '@sentry/server-utils';
import { init } from './sdk';
import type { NodeOptions } from './types';

/**
 * Options for {@link eveInstrumentation}: every `Sentry.init` option, plus how to derive the
 * conversation id.
 */
export interface EveInstrumentationOptions extends NodeOptions {
  /**
   * Derive the Sentry conversation id from the eve session. Defaults to the durable session id
   * (`session.id`), which is stable across every turn of a session and so groups them into one
   * conversation. Return `null`/`undefined` to skip setting it for a turn.
   */
  getConversationId?: (context: { session: { id: string } }) => string | null | undefined;
}

/**
 * The `defineInstrumentation` provider shape this returns. Typed structurally rather than importing
 * from `eve`, so the SDK carries no dependency on the framework — the shape is checked at the
 * `defineInstrumentation(...)` call site in the user's app instead.
 */
interface EveInstrumentationProvider {
  setup: () => void;
  events: {
    'turn.started': (event: { sessionId: string }) => void;
    'step.attempt.started': (event: { scope: { sessionId: string } }) => void;
  };
}

/**
 * All-in-one Sentry setup for an [eve](https://eve.dev) agent, wired into a single
 * `agent/instrumentation/*.ts` provider file.
 *
 * @example
 * ```ts
 * // agent/instrumentation/sentry.ts
 * import * as Sentry from '@sentry/node';
 * import { defineInstrumentation } from 'eve/instrumentation';
 *
 * export default defineInstrumentation(Sentry.eveInstrumentation({ dsn: '__DSN__' }));
 * ```
 *
 * It:
 * - runs `Sentry.init` with the given options at server startup (`setup`), adding
 *   {@link eveIntegration} so gen_ai inputs/outputs are recorded by default (eve stamps every AI SDK
 *   call with `recordInputs`/`recordOutputs: false`);
 * - tags each turn's AI spans with a Sentry conversation id via `turn.started` / `step.attempt.started`
 *   events — the instrumentation-provider equivalent of `eveConversationHook`. Provider event handlers
 *   receive the session id on the event (`event.sessionId` / `event.scope.sessionId`), unlike hook
 *   handlers, which read it from their context.
 */
export function eveInstrumentation(options: EveInstrumentationOptions = {}): EveInstrumentationProvider {
  const { getConversationId, ...initOptions } = options;

  const setConversationIdFromSession = (sessionId: string): void => {
    setConversationId(getConversationId ? getConversationId({ session: { id: sessionId } }) : sessionId);
  };

  return {
    setup() {
      init({ ...initOptions, integrations: withEveIntegration(initOptions.integrations) });
    },
    events: {
      'turn.started': event => setConversationIdFromSession(event.sessionId),
      'step.attempt.started': event => setConversationIdFromSession(event.scope.sessionId),
    },
  };
}

function withEveIntegration(integrations: NodeOptions['integrations']): NodeOptions['integrations'] {
  const eve = eveIntegration();
  if (typeof integrations === 'function') {
    return (defaults: Integration[]) => [...integrations(defaults), eve];
  }
  return [...(integrations ?? []), eve];
}
