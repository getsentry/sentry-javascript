import * as Sentry from '@sentry/node';
import amqp from 'amqplib';

// A topic exchange, so the routing key and the queue name differ.
const exchangeName = 'orders';
const queueName = 'orders-worker';
const routingKey = 'order.created.12345';
const amqpUsername = 'sentry';
const amqpPassword = 'sentry';

const AMQP_URL = `amqp://${amqpUsername}:${amqpPassword}@localhost:5672/`;

// A `noAck` consumer never settles a message, so its span has to end when dispatch returns.
const NO_ACKNOWLEDGEMENT = { noAck: true };

(async () => {
  const { connection, channel } = await connectToRabbitMQ();

  await channel.assertExchange(exchangeName, 'topic', { durable: false, autoDelete: true });
  await channel.assertQueue(queueName, { durable: false, exclusive: true });
  await channel.bindQueue(queueName, exchangeName, 'order.created.#');

  // Publish before consuming, so the broker sends `BasicConsumeOk` and the delivery back to back.
  await Sentry.startSpan({ name: 'root span' }, async () => {
    channel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify({ foo: 'bar01' })));
  });

  await consumeMessageFromQueue(queueName, channel);

  await channel.close();
  await connection.close();
})();

async function connectToRabbitMQ() {
  // The broker accepts TCP before AMQP handshakes succeed, so early connects can reject while it boots.
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const connection = await amqp.connect(AMQP_URL);
      const channel = await connection.createChannel();
      return { connection, channel };
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function consumeMessageFromQueue(queueName, channel) {
  return new Promise((resolve, reject) => {
    const onMessage = message => (message ? resolve() : reject(new Error('No message received')));

    // Invalid `arguments` throw before the RPC, so the channel stays open for the next `consume`.
    try {
      channel.consume('orders-archive', onMessage, { arguments: 'invalid' });
    } catch {
      // Expected.
    }

    channel.consume(queueName, onMessage, NO_ACKNOWLEDGEMENT).catch(reject);
  });
}
