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
    },
  );
}

run();
