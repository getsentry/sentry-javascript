const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

// Must be required after Sentry is initialized
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URL || '', {
  useUnifiedTopology: true,
});

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await client.connect();

        const database = client.db('admin');
        const collection = database.collection('movies');

        await collection.insertOne({ title: 'Rick and Morty' });
        await collection.findOne({ title: 'Back to the Future' });
        await collection.updateOne({ title: 'Back to the Future' }, { $set: { title: 'South Park' } });
        await collection.findOne({ title: 'South Park' });

        await collection.find({ title: 'South Park' }).toArray();
      } finally {
        await client.close();
      }
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
