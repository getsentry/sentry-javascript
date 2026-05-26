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

  // Resolve once the consumer has actually joined its group. A fixed sleep
  // here was racy on slow CI runners: if the producer sent before the
  // consumer joined, the consumer transaction sometimes wasn't created
  // within the test timeout. Register the listener before `run()` so the
  // event can't fire before we're listening.
  const groupJoined = new Promise(resolve => {
    consumer.on(consumer.events.GROUP_JOIN, () => resolve());
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      // eslint-disable-next-line no-console
      console.debug('Received message', message.value.toString());
    },
  });

  await groupJoined;

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
