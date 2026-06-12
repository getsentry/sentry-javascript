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

      await BlogPost.aggregate([{ $match: {} }]);

      await BlogPost.insertMany([{ title: 'Insert', body: 'Insert body', date: new Date() }]);

      await BlogPost.bulkWrite([{ insertOne: { document: { title: 'Bulk', body: 'Bulk body', date: new Date() } } }]);

      // Document instance methods. On v9 these are not doc-method-patched (needsDocumentMethodPatch
      // only matches 8.x) but are still instrumented via the patched Query.exec path.
      const doc = await BlogPost.create({ title: 'DocMethod', body: 'b', date: new Date() });
      await doc.updateOne({ title: 'DocMethodUpdated' });
      await doc.deleteOne();
    },
  );
}

run();
