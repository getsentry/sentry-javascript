import type { Client } from '@sentry/core';

const eveRecordingClients = new WeakSet<Client>();

/**
 * Mark this client as running under eve, so the Vercel AI channel subscriber records gen_ai
 * inputs/outputs by default, as far as `ai` still provides them.
 *
 * eve stamps every AI SDK call with `recordInputs`/`recordOutputs: false` as its framework default
 * (its content-capture default is "public conversations only"). That per-call flag on the
 * `ai:telemetry` channel event otherwise outranks the global `dataCollection.genAI` setting, so
 * message content would be dropped even when the user wants it. In this mode the per-call flag is
 * treated as eve's default rather than an end-user decision: an explicit `recordInputs`/`recordOutputs`
 * on the integration or a `dataCollection.genAI` setting still takes precedence.
 *
 * `ai` >= 7.0.163 strips content from calls with these flags set to false and publishes no channel result. The
 * subscriber then reads the result itself and honors the per-call flags, so this mode only applies to results
 * `ai` publishes. eve >= 1.0.0-rc.10 sets the flags from `Sentry.eveInstrumentation()`'s `tracePolicy`.
 */
export function markEveGenAiRecordingDefault(client: Client): void {
  eveRecordingClients.add(client);
}

export function isEveGenAiRecordingDefault(client: Client): boolean {
  return eveRecordingClients.has(client);
}
