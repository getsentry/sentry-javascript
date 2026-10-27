import type { Client } from '@sentry/core';

const eveRecordingClients = new WeakSet<Client>();

/**
 * Mark this client as running under eve, so the Vercel AI channel subscriber records gen_ai
 * inputs/outputs by default.
 *
 * eve stamps every AI SDK call with `recordInputs`/`recordOutputs: false` as its framework default
 * (its content-capture default is "public conversations only"). That per-call flag on the
 * `ai:telemetry` channel event otherwise outranks the global `dataCollection.genAI` setting, so
 * message content would be dropped even when the user wants it. In this mode the per-call flag is
 * treated as eve's default rather than an end-user decision: an explicit `recordInputs`/`recordOutputs`
 * on the integration or a `dataCollection.genAI` setting still takes precedence.
 */
export function markEveGenAiRecordingDefault(client: Client): void {
  eveRecordingClients.add(client);
}

export function isEveGenAiRecordingDefault(client: Client): boolean {
  return eveRecordingClients.has(client);
}
