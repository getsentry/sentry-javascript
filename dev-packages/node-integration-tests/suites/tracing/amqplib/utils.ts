import amqp from 'amqplib';
import type { Channel, Connection } from 'amqplib';
import { ACKNOWLEDGEMENT, AMQP_URL, QUEUE_OPTIONS } from './constants';

export type RabbitMQData = {
  connection: Connection;
  channel: Channel;
};

export async function connectToRabbitMQ(): Promise<RabbitMQData> {
  const connection = await amqp.connect(AMQP_URL);
  const channel = await connection.createChannel();
  return { connection, channel };
}

export async function createQueue(queueName: string, channel: Channel): Promise<void> {
  await channel.assertQueue(queueName, QUEUE_OPTIONS);
}

export function sendMessageToQueue(queueName: string, channel: Channel, message: string): void {
  channel.sendToQueue(queueName, Buffer.from(message));
}

async function consumer(queueName: string, channel: Channel): Promise<void> {
  await channel.consume(
    queueName,
    message => {
      if (message) {
        channel.ack(message);
      }
    },
    ACKNOWLEDGEMENT,
  );
}

export async function consumeMessageFromQueue(queueName: string, channel: Channel): Promise<void> {
  await consumer(queueName, channel);
}
