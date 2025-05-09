// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

import { Kafka } from 'kafkajs';

async function run() {
  const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['localhost:9092'],
  });

  const admin = kafka.admin();
  await admin.connect();

  const producer = kafka.producer();
  await producer.connect();

  await admin.createTopics({
    topics: [{ topic: 'test-topic' }],
  });

  const consumer = kafka.consumer({
    groupId: 'test-group',
  });

  await consumer.connect();
  await consumer.subscribe({ topic: 'test-topic', fromBeginning: true });

  consumer.run({
    eachMessage: async ({ message }) => {
      // eslint-disable-next-line no-console
      console.debug('Received message', message.value.toString());
    },
  });

  // Wait for the consumer to be ready
  await new Promise(resolve => setTimeout(resolve, 4000));

  await producer.send({
    topic: 'test-topic',
    messages: [
      {
        value: 'TEST_MESSAGE',
      },
    ],
  });
}

run();
