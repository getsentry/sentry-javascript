import * as Sentry from '@sentry/node';
import './init';
import { connectToRabbitMQ, consumeMessageFromQueue, createQueue, sendMessageToQueue } from './utils';

const queueName = 'queue1';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  const { connection, channel } = await connectToRabbitMQ();
  await createQueue(queueName, channel);

  await Sentry.startSpan({ name: 'root span' }, async () => {
    sendMessageToQueue(queueName, channel, JSON.stringify({ foo: 'bar01' }));
  });

  await consumeMessageFromQueue(queueName, channel);
  await channel.close();
  await connection.close();
})();
