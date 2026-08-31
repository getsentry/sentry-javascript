import { describe, expect, it } from 'vitest';
import { resolveDestination } from '../../src/integrations/amqplib';

describe('resolveDestination', () => {
  it.each([
    ['orders', 'order.created.12345', 'orders'],
    ['logs', '', 'logs'],
    ['amq.fanout', undefined, 'amq.fanout'],
  ])(
    'keeps the per-message routing key out of the destination on the %s exchange',
    (exchange, routingKey, expected) => {
      expect(resolveDestination(exchange, routingKey)).toBe(expected);
    },
  );

  // The default exchange binds every queue under a key equal to the queue's own name, so there the
  // routing key names the queue and is as bounded as an exchange name.
  it('uses the routing key on the default exchange, where it is the queue name', () => {
    expect(resolveDestination('', 'orders-worker')).toBe('orders-worker');
  });

  it.each([
    ['', ''],
    ['', undefined],
    [undefined, undefined],
  ])('resolves no destination from exchange %o and routing key %o', (exchange, routingKey) => {
    expect(resolveDestination(exchange, routingKey)).toBeUndefined();
  });
});
