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

  // Stop the process from exiting before the transaction is sent
  setInterval(() => {}, 1000);
})();

async function connectToRabbitMQ() {
  const connection = await amqp.connect(AMQP_URL);
  const channel = await connection.createChannel();
  return { connection, channel };
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
