import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';
import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Socket.io';

export const instrumentSocketIo = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new SocketIoInstrumentation({
      emitHook(span) {
        addOriginToSpan(span, 'auto.socket.otel.socket_io');
      },
      onHook(span) {
        addOriginToSpan(span, 'auto.socket.otel.socket_io');
      },
      traceReserved: true,
    }),
);

const _socketIoIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentSocketIo();
    },
  };
}) satisfies IntegrationFn;

/**
 * Socket.io integration
 *
 * Capture tracing data for Socket.io
 */
export const socketIoIntegration = defineIntegration(_socketIoIntegration);
