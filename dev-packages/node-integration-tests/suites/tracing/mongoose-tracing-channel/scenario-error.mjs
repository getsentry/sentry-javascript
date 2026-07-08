import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO_URL || '');

  const BlogPost = mongoose.model('BlogPost', new mongoose.Schema({ title: String }));

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      // An unrecognized aggregation stage makes mongodb reject the operation. The rejection must flag
      // the mongoose channel span as errored (the SDK marks the span but does not swallow the error).
      await BlogPost.aggregate([{ $notAValidStage: {} }]).catch(() => {
        // swallowed here so the scenario's transaction still completes and is flushed
      });
    },
  );
}

run();
