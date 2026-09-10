import { setConversationId } from '@sentry/core';

/**
 * The subset of eve's hook context (`HookContext` from `eve/hooks`) this helper reads. Typed
 * structurally rather than importing from `eve`, so the SDK carries no dependency on the framework —
 * the shape is checked at the `defineHook(...)` call site in the user's app instead.
 */
interface EveHookContext {
  session: { id: string };
}

type EveHookHandler = (event: unknown, context: EveHookContext) => void;

interface EveConversationHookOptions {
  /**
   * Derive the Sentry conversation id from the eve hook context. Defaults to the durable session id
   * (`ctx.session.id`), which is stable across every turn of a session and so groups them into one
   * conversation.
   */
  getConversationId?: (context: EveHookContext) => string | null | undefined;
}

/**
 * Builds the hook definition for an eve `agent/hooks/*.ts` file that tags a session's AI spans with
 * a Sentry conversation id, linking every turn of the session in the Agents "Conversations" view.
 *
 * ```ts
 * // agent/hooks/sentry.ts
 * import * as Sentry from '@sentry/node';
 * import { defineHook } from 'eve/hooks';
 *
 * export default defineHook(Sentry.eveConversationHook());
 * ```
 *
 * The id is set on the isolation scope; the default (always-on) `conversationIdIntegration` then
 * stamps `gen_ai.conversation.id` onto the gen_ai spans the Vercel AI instrumentation records for
 * that turn. That indirection is why the id has to be set here and not on the AI call: eve's session
 * id never reaches the AI SDK's telemetry channel, so it can only be attached via the scope.
 *
 * Subscribes to both `turn.started` and `step.started`. Each eve turn is a fresh durable-workflow
 * request with its own isolation scope, and a turn that parks and resumes (approvals, compaction)
 * resumes in yet another request; `turn.started` alone would miss the model calls after a resume.
 * `step.started` fires before every model call, so together they cover each request that produces
 * spans. Re-setting the same id is idempotent, so the overlap is harmless.
 */
export function eveConversationHook(options: EveConversationHookOptions = {}): {
  events: Record<'turn.started' | 'step.started', EveHookHandler>;
} {
  const { getConversationId } = options;

  const setConversationIdFromContext: EveHookHandler = (_event, context) => {
    const conversationId = getConversationId ? getConversationId(context) : context.session.id;
    setConversationId(conversationId);
  };

  return {
    events: {
      'turn.started': setConversationIdFromContext,
      'step.started': setConversationIdFromContext,
    },
  };
}
