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

      // Filter with a real value, to assert it is redacted out of `db.query.text`.
      await BlogPost.findOne({ title: 'Test' });

      await BlogPost.aggregate([{ $match: { title: 'Test' } }]);

      await BlogPost.insertMany([
        { title: 'Insert1', body: 'b', date: new Date() },
        { title: 'Insert2', body: 'b', date: new Date() },
      ]);

      await BlogPost.bulkWrite([
        { insertOne: { document: { title: 'Bulk1', body: 'b', date: new Date() } } },
        { insertOne: { document: { title: 'Bulk2', body: 'b', date: new Date() } } },
      ]);

      // Drive a cursor to exercise the `mongoose:cursor:next` channel.
      const cursor = BlogPost.find().cursor();
      for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        // iterate
      }
    },
  );
}

run();
