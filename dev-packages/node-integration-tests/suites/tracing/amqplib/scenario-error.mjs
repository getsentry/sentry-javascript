import * as Sentry from '@sentry/node';
import amqp from 'amqplib';

// Dedicated queue to keep this scenario isolated from the others sharing the broker.
const queueName = 'queue-error';
const amqpUsername = 'sentry';
const amqpPassword = 'sentry';

const AMQP_URL = `amqp://${amqpUsername}:${amqpPassword}@localhost:5672/`;
const ACKNOWLEDGEMENT = { noAck: false };

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
  // Retry the connection: the broker can accept TCP before AMQP handshakes succeed, so the first
  // connects may reject during the broker boot window. An unretried rejection would surface as
  // an unhandled rejection and be reported as an error envelope instead of the expected transaction.
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
            // Reject the message without requeue. This ends the consumer span with an error status.
            channel.nack(message, false, false);
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
