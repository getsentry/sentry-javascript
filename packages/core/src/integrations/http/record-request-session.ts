import type { Client } from '../../client';
import { debug } from '../../utils/debug-logger';
import { DEBUG_BUILD } from '../../debug-build';
import type { Scope } from '../../scope';
import type { HttpServerResponse } from './types';
import type { AggregationCounts } from '../../types-hoist/session';

const clientToRequestSessionAggregatesMap = new WeakMap<
  Client,
  { [timestampRoundedToSeconds: string]: { exited: number; crashed: number; errored: number } }
>();

/**
 * Starts a session and tracks it in the context of a given isolation scope.
 * When the passed response is finished, the session is put into a task and is
 * aggregated with other sessions that may happen in a certain time window
 * (sessionFlushingDelayMs).
 *
 * The sessions are always aggregated by the client that is on the current scope
 * at the time of ending the response (if there is one).
 */
export function recordRequestSession(
  client: Client,
  {
    requestIsolationScope,
    response,
    sessionFlushingDelayMS,
  }: {
    requestIsolationScope: Scope;
    response: HttpServerResponse;
    sessionFlushingDelayMS?: number;
  },
): void {
  requestIsolationScope.setSDKProcessingMetadata({
    requestSession: { status: 'ok' },
  });

  response.once('close', () => {
    const requestSession = requestIsolationScope.getScopeData().sdkProcessingMetadata.requestSession;

    if (client && requestSession) {
      DEBUG_BUILD && debug.log(`Recorded request session with status: ${requestSession.status}`);

      const roundedDate = new Date();
      roundedDate.setSeconds(0, 0);
      const dateBucketKey = roundedDate.toISOString();

      const existingClientAggregate = clientToRequestSessionAggregatesMap.get(client);
      const bucket = existingClientAggregate?.[dateBucketKey] || { exited: 0, crashed: 0, errored: 0 };
      bucket[({ ok: 'exited', crashed: 'crashed', errored: 'errored' } as const)[requestSession.status]]++;

      if (existingClientAggregate) {
        existingClientAggregate[dateBucketKey] = bucket;
      } else {
        DEBUG_BUILD && debug.log('Opened new request session aggregate.');
        const newClientAggregate = { [dateBucketKey]: bucket };
        clientToRequestSessionAggregatesMap.set(client, newClientAggregate);

        const flushPendingClientAggregates = (): void => {
          clearTimeout(timeout);
          unregisterClientFlushHook();
          clientToRequestSessionAggregatesMap.delete(client);

          const aggregatePayload: AggregationCounts[] = Object.entries(newClientAggregate).map(
            ([timestamp, value]) => ({
              started: timestamp,
              exited: value.exited,
              errored: value.errored,
              crashed: value.crashed,
            }),
          );
          client.sendSession({ aggregates: aggregatePayload });
        };

        const unregisterClientFlushHook = client.on('flush', () => {
          DEBUG_BUILD && debug.log('Sending request session aggregate due to client flush');
          flushPendingClientAggregates();
        });
        const timeout = setTimeout(() => {
          DEBUG_BUILD && debug.log('Sending request session aggregate due to flushing schedule');
          flushPendingClientAggregates();
        }, sessionFlushingDelayMS).unref?.();
      }
    }
  });
}
