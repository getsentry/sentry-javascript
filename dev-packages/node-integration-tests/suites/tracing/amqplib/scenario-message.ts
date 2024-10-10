import * as Sentry from '@sentry/node';
import './init';
import { connectToRabbitMQ, consumeMessageFromQueue, createQueue, sendMessageToQueue } from './utils';

const queueName = 'queue1';

// Stop the process from exiting before the transaction is sent
// eslint-disable-next-line @typescript-eslint/no-empty-function
setInterval(() => {}, 1000);

// eslint-disable-next-line @typescript-eslint/no-floating-promises
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
