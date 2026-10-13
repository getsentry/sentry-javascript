import * as Sentry from '@sentry/node';
import mongodb from 'mongodb';

const { MongoClient } = mongodb;

const client = new MongoClient(process.env.MONGO_URL || '');

async function run() {
  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      try {
        await client.connect();

        const collection = client.db('admin').collection('movies');

        await collection.insertOne({ title: 'Rick and Morty' });
        await collection.findOne({ title: 'Back to the Future' });
        await collection.updateOne({ title: 'Back to the Future' }, { $set: { title: 'South Park' } });
        await collection.find({ title: 'South Park' }).toArray();

        // A query the server rejects, to exercise the error-status span path.
        await collection
          .find({ $thisOperatorDoesNotExist: 1 })
          .toArray()
          .catch(() => {});
      } finally {
        await client.close();
      }
    },
  );
}

run();
