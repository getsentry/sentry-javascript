import * as Sentry from '@sentry/node';
import mongodb from 'mongodb';

const { MongoClient } = mongodb;

// maxPoolSize: 1 so the concurrent block below contends for the single
// pooled connection. the queued checkouts resolve from the pool's detached
// context, exercising the checkout context patch.
const client = new MongoClient(process.env.MONGO_URL || '', { maxPoolSize: 1 });

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

        // Pool-contention: each op runs under its own span. If the pooled
        // checkout loses the caller's context, a queued op's command span
        // would parent to a sibling op instead of its own span.
        await Promise.all(
          ['a', 'b', 'c'].map(marker =>
            Sentry.startSpan({ name: `op-${marker}` }, () => collection.findOne({ marker })),
          ),
        );
      } finally {
        await client.close();
      }
    },
  );
}

run();
