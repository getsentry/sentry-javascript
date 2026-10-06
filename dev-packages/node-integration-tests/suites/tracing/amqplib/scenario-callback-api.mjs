import * as Sentry from '@sentry/node';
import amqp from 'amqplib/callback_api.js';

const queueName = 'callback-queue';
const amqpUsername = 'sentry';
const amqpPassword = 'sentry';

const AMQP_URL = `amqp://${amqpUsername}:${amqpPassword}@localhost:5672/`;

(async () => {
  const connection = await connectToRabbitMQ();
  const channel = await toPromise(cb => connection.createChannel(cb));
  await toPromise(cb => channel.assertQueue(queueName, { durable: false, exclusive: true }, cb));

  const received = new Promise((resolve, reject) => {
    channel.consume(
      queueName,
      message => {
        if (message) {
          channel.ack(message);
          resolve();
        } else {
          reject(new Error('No message received'));
        }
      },
      { noAck: false },
      err => err && reject(err),
    );
  });

  await Sentry.startSpan({ name: 'root span' }, async () => {
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify({ foo: 'bar01' })));
  });

  await received;

  await toPromise(cb => channel.close(cb));
  await toPromise(cb => connection.close(cb));
})();

async function connectToRabbitMQ() {
  // The broker accepts TCP before AMQP handshakes succeed, so early connects can fail while it boots.
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await toPromise(cb => amqp.connect(AMQP_URL, cb));
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

function toPromise(fn) {
  return new Promise((resolve, reject) => fn((err, result) => (err ? reject(err) : resolve(result))));
}
