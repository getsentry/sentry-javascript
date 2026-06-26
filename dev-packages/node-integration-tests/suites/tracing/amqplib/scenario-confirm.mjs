import * as Sentry from '@sentry/node';
import amqp from 'amqplib';

// Dedicated queue so the unconsumed confirm message doesn't leak into other scenarios sharing the broker.
const queueName = 'queue-confirm';
const amqpUsername = 'sentry';
const amqpPassword = 'sentry';

const AMQP_URL = `amqp://${amqpUsername}:${amqpPassword}@localhost:5672/`;

const QUEUE_OPTIONS = {
  durable: true,
  exclusive: false,
  autoDelete: false,
  arguments: {
    'x-message-ttl': 30000,
    'x-max-length': 1000,
  },
};

(async () => {
  const { connection, channel } = await connectToRabbitMQ();
  await channel.assertQueue(queueName, QUEUE_OPTIONS);

  await Sentry.startSpan({ name: 'root span' }, async () => {
    await new Promise((resolve, reject) => {
      // On a confirm channel, sendToQueue delegates to publish and registers a broker-confirm
      // callback. The producer span ends when the broker confirms.
      channel.sendToQueue(queueName, Buffer.from(JSON.stringify({ foo: 'bar01' })), {}, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });

  await channel.close();
  await connection.close();
})();

async function connectToRabbitMQ() {
  // Retry the connection: the broker can accept TCP before AMQP handshakes succeed, so the first
  // connects may reject during the broker boot window. An unretried rejection would surface as
  // an unhandled rejection and be reported as an error envelope instead of the expected transaction.
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const connection = await amqp.connect(AMQP_URL);
      const channel = await connection.createConfirmChannel();
      return { connection, channel };
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}
