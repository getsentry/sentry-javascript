import * as Sentry from '@sentry/node';
import mongodb from 'mongodb';

const { MongoClient } = mongodb;

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

run();
