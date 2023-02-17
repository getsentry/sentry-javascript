import type { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { createProfilingEventEnvelope, isProfiledTransactionEvent, maybeRemoveProfileFromSdkMetadata } from './utils';

// We need this integration in order to actually send data to Sentry. We hook into the event processor
// and inspect each event to see if it is a transaction event and if that transaction event
// contains a profile on it's metadata. If that is the case, we create a profiling event envelope
// and delete the profile from the transaction metadata.
/**
 *
 */
export class BrowserProfilingIntegration implements Integration {
  name = 'ProfilingIntegration';
  getCurrentHub?: () => Hub = undefined;

  /**
   *
   */
  setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.getCurrentHub = getCurrentHub;
    addGlobalEventProcessor(this.handleGlobalEvent.bind(this));
  }

  /**
   *
   */
  handleGlobalEvent(event: Event): Event {
    if (this.getCurrentHub === undefined) {
      return maybeRemoveProfileFromSdkMetadata(event);
    }

    if (isProfiledTransactionEvent(event)) {
      // Client, Dsn and Transport are all required to be able to send the profiling event to Sentry.
      // If either of them is not available, we remove the profile from the transaction event.
      // and forward it to the next event processor.
      const hub = this.getCurrentHub();

      const client = hub.getClient();
      if (!client) {
        if (__DEBUG_BUILD__) {
          logger.log(
            '[Profiling] getClient did not return a Client, removing profile from event and forwarding to next event processors.',
          );
        }
        return maybeRemoveProfileFromSdkMetadata(event);
      }

      const dsn = client.getDsn();
      if (!dsn) {
        if (__DEBUG_BUILD__) {
          logger.log(
            '[Profiling] getDsn did not return a Dsn, removing profile from event and forwarding to next event processors.',
          );
        }
        return maybeRemoveProfileFromSdkMetadata(event);
      }

      const transport = client.getTransport();
      if (!transport) {
        if (__DEBUG_BUILD__) {
          logger.log(
            '[Profiling] getTransport did not return a Transport, removing profile from event and forwarding to next event processors.',
          );
        }
        return maybeRemoveProfileFromSdkMetadata(event);
      }

      // If all required components are available, we construct a profiling event envelope and send it to Sentry.
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Preparing envelope and sending a profiling event');
      }
      const envelope = createProfilingEventEnvelope(event, dsn);

      if (envelope) {
        transport.send(envelope);
      }
    }

    // Ensure sdkProcessingMetadata["profile"] is removed from the event before forwarding it to the next event processor.
    return maybeRemoveProfileFromSdkMetadata(event);
  }
}
