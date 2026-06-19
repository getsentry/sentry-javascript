import { Kafka } from 'kafkajs';

async function run() {
  const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['localhost:9092'],
    // The invalid-topic error is non-retriable, but disable retries anyway so the failing
    // `send` rejects promptly and produces exactly one errored producer span.
    retry: { retries: 0 },
  });

  const producer = kafka.producer();
  await producer.connect();

  // Topic names may not contain spaces, so the broker rejects this send. The producer span should
  // be marked as errored.
  await producer
    .send({
      topic: 'invalid topic name',
      messages: [{ value: 'TEST_MESSAGE' }],
    })
    .catch(() => {
      // swallow - we assert on the emitted span, not the thrown error
    });

  await producer.disconnect();
}

run();
