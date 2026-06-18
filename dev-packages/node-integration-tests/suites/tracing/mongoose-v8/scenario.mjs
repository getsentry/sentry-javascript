import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO_URL || '');

  const BlogPostSchema = new mongoose.Schema({
    title: String,
    body: String,
    date: Date,
  });

  const BlogPost = mongoose.model('BlogPost', BlogPostSchema);

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      const post = new BlogPost({ title: 'Test', body: 'Test body', date: new Date() });

      await post.save();

      await BlogPost.findOne({});

      // Document instance methods. On mongoose 8.21.0+ these return a lazy Query that the
      // instrumentation must hand back un-executed (regression guard for the thenable trap).
      await post.updateOne({ title: 'Updated' });

      // Verify the update actually persisted (i.e. the query executed exactly when awaited).
      const updated = await BlogPost.findById(post._id);
      if (!updated || updated.title !== 'Updated') {
        throw new Error(`updateOne did not persist as expected, got: ${updated && updated.title}`);
      }

      // Lazy-Query guard: a document updateOne returns a lazy Query that only runs when awaited.
      // Building it without awaiting must NOT execute it — if the instrumentation runs it (e.g. by
      // calling `.then()` on the returned thenable), this premature write would change the document.
      const lazyDoc = await new BlogPost({ title: 'Original', body: 'b', date: new Date() }).save();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      lazyDoc.updateOne({ title: 'PrematurelyExecuted' });
      await new Promise(resolve => setTimeout(resolve, 250));
      const lazyCheck = await BlogPost.findById(lazyDoc._id);
      if (!lazyCheck || lazyCheck.title !== 'Original') {
        throw new Error(
          `lazy updateOne was executed without being awaited (got title: ${lazyCheck && lazyCheck.title})`,
        );
      }

      await post.deleteOne();
    },
  );
}

run();
