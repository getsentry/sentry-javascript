import { subscribe } from 'node:diagnostics_channel';
import {
  handleOnEnd,
  handleOnError,
  handleOnLanguageModelCallEnd,
  handleOnLanguageModelCallStart,
  handleOnStart,
  handleOnToolExecutionEnd,
  handleOnToolExecutionStart,
} from './dc-handlers';

const DC_CHANNEL = 'aisdk:telemetry';

function onDiagnosticMessage(message: unknown): void {
  const msg = message as { type: string; event: Record<string, unknown> };
  if (!msg?.type || !msg?.event) return;

  try {
    switch (msg.type) {
      case 'onStart':
        handleOnStart(msg.event);
        break;
      case 'onLanguageModelCallStart':
        handleOnLanguageModelCallStart(msg.event);
        break;
      case 'onLanguageModelCallEnd':
        handleOnLanguageModelCallEnd(msg.event);
        break;
      case 'onToolExecutionStart':
        handleOnToolExecutionStart(msg.event);
        break;
      case 'onToolExecutionEnd':
        handleOnToolExecutionEnd(msg.event);
        break;
      case 'onEnd':
        handleOnEnd(msg.event);
        break;
      case 'onError':
        handleOnError(msg.event);
        break;
    }
  } catch {
    // Never let telemetry processing break the application
  }
}

let subscribed = false;

/**
 * Subscribe to AI SDK v7+ diagnostic channel for telemetry events.
 *
 * On v3-v6 the channel is never published to, so this is inert.
 * On v7+ the AI SDK publishes all telemetry events to 'aisdk:telemetry'
 * regardless of which OpenTelemetry integration the user has registered.
 */
export function subscribeAiSdkDiagnosticChannel(): void {
  if (subscribed) return;
  subscribed = true;

  try {
    subscribe(DC_CHANNEL, onDiagnosticMessage);
  } catch {
    // subscribe may not be available on all runtimes
  }
}
