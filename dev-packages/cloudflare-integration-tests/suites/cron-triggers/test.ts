import type { Envelope, SerializedCheckIn } from '@sentry/core';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it, onTestFinished } from 'vitest';
import { createRunner } from '../../runner';

it.for([true, false])(
  'cacheClient: %s - sends the in_progress check-in while the scheduled handler runs, then the ok check-in',
  async (cacheClient, { signal }) => {
    // The handler waits for a response from this server, which answers only after the in_progress check-in
    // has arrived. A check-in that waits for the flush after the handler would keep the run from ending.
    let openGate: () => void = () => undefined;
    const gateOpened = new Promise<void>(resolve => {
      openGate = resolve;
    });
    const gate = createServer((_req, res) => {
      void gateOpened.then(() => res.end());
    });
    await new Promise<void>(resolve => gate.listen(0, resolve));
    onTestFinished(() => {
      gate.closeAllConnections();
      gate.close();
    });

    let inProgressCheckInId: string | undefined;

    const runner = createRunner(__dirname)
      .withServerUrl(`http://localhost:${(gate.address() as AddressInfo).port}`)
      .withWranglerArgs('--var', `CACHE_CLIENT:${cacheClient}`)
      .expect((envelope: Envelope) => {
        const checkIn = envelope[1][0]?.[1] as SerializedCheckIn;

        expect(checkIn).toEqual(
          expect.objectContaining({
            monitor_slug: 'daily-report',
            status: 'in_progress',
            monitor_config: { schedule: { type: 'crontab', value: '30 9 * * MON-FRI' } },
          }),
        );
        inProgressCheckInId = checkIn.check_in_id;
        openGate();
      })
      .expect((envelope: Envelope) => {
        expect(envelope[1][0]?.[1]).toEqual(
          expect.objectContaining({
            check_in_id: inProgressCheckInId,
            monitor_slug: 'daily-report',
            status: 'ok',
            duration: expect.any(Number),
          }),
        );
      })
      .start(signal);

    await runner.makeRequest('get', '/cdn-cgi/handler/scheduled?cron=30+9+*+*+MON-FRI');
    await runner.completed();
  },
);

it('sends an error check-in and the error when the scheduled handler throws', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect((envelope: Envelope) => {
      expect(envelope[1][0]?.[1]).toEqual(
        expect.objectContaining({
          monitor_slug: 'sync-inventory',
          status: 'in_progress',
          monitor_config: { schedule: { type: 'crontab', value: '0 */6 * * *' } },
        }),
      );
    })
    .expect((envelope: Envelope) => {
      expect(envelope[1][0]?.[1]).toEqual(expect.objectContaining({ monitor_slug: 'sync-inventory', status: 'error' }));
    })
    .expect((envelope: Envelope) => {
      expect(envelope[1][0]?.[1]).toMatchObject({
        exception: {
          values: [
            {
              value: 'Boom from sync-inventory',
              mechanism: { type: 'auto.faas.cloudflare.scheduled', handled: false },
            },
          ],
        },
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/cdn-cgi/handler/scheduled?cron=0+*/6+*+*+*', { expectError: true });
  await runner.completed();
});
