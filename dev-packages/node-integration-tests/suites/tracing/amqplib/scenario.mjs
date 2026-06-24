import * as Sentry from '@sentry/node';
import amqp from 'amqplib';

const queueName = 'queue1';
const amqpUsername = 'sentry';
const amqpPassword = 'sentry';

const AMQP_URL = `amqp://${amqpUsername}:${amqpPassword}@localhost:5672/`;
const ACKNOWLEDGEMENT = { noAck: false };

const QUEUE_OPTIONS = {
  durable: true, // Make the queue durable
  exclusive: false, // Not exclusive
  autoDelete: false, // Don't auto-delete the queue
  arguments: {
    'x-message-ttl': 30000, // Message TTL of 30 seconds
    'x-max-length': 1000, // Maximum queue length of 1000 messages
  },
};

(async () => {
  const { connection, channel } = await connectToRabbitMQ();
  await createQueue(queueName, channel);

  const consumeMessagePromise = consumeMessageFromQueue(queueName, channel);

  await Sentry.startSpan({ name: 'root span' }, async () => {
    sendMessageToQueue(queueName, channel, JSON.stringify({ foo: 'bar01' }));
  });

  await consumeMessagePromise;

  await channel.close();
  await connection.close();
})();

async function connectToRabbitMQ() {
  // Retry up to 5 times with 1s backoff. The docker-compose healthcheck
  // (`rabbitmq-diagnostics -q ping`) reports the broker ready before AMQP
  // handshakes actually succeed, so the first connect can race with broker
  // boot and reject with "Socket closed abruptly during opening handshake".
  // That rejection becomes an unhandled rejection captured by Sentry and
  // sent as an error envelope, which the runner sees ahead of the expected
  // transaction and reports as "Expected envelope item type 'transaction'
  // but got 'event'" (the flake reported in the issue).
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

async function createQueue(queueName, channel) {
  await channel.assertQueue(queueName, QUEUE_OPTIONS);
}

function sendMessageToQueue(queueName, channel, message) {
  channel.sendToQueue(queueName, Buffer.from(message));
}

async function consumer(queueName, channel) {
  return new Promise((resolve, reject) => {
    channel
      .consume(
        queueName,
        message => {
          if (message) {
            channel.ack(message);
            resolve();
          } else {
            reject(new Error('No message received'));
          }
        },
        ACKNOWLEDGEMENT,
      )
      .catch(reject);
  });
}

async function consumeMessageFromQueue(queueName, channel) {
  await consumer(queueName, channel);
}
