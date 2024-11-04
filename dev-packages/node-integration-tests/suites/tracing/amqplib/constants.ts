const amqpUsername = 'sentry';
const amqpPassword = 'sentry';

export const AMQP_URL = `amqp://${amqpUsername}:${amqpPassword}@localhost:5672/`;
export const ACKNOWLEDGEMENT = { noAck: false };

export const QUEUE_OPTIONS = {
  durable: true, // Make the queue durable
  exclusive: false, // Not exclusive
  autoDelete: false, // Don't auto-delete the queue
  arguments: {
    'x-message-ttl': 30000, // Message TTL of 30 seconds
    'x-max-length': 1000, // Maximum queue length of 1000 messages
  },
};
