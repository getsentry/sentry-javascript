import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO_URL || '');

  const Schema = mongoose.Schema;

  const BlogPostSchema = new Schema({
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
      const post = new BlogPost();
      post.title = 'Test';
      post.body = 'Test body';
      post.date = new Date();

      await post.save();

      await BlogPost.findOne({});
    },
  );
}

run();
