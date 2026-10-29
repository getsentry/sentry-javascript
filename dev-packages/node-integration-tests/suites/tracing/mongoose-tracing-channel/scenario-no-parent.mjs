import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGO_URL || '');

  const BlogPost = mongoose.model('BlogPost', new mongoose.Schema({ title: String }));

  await new BlogPost({ title: 'Test' }).save();
  await BlogPost.find({});

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, async () => {
    await BlogPost.findOne({});
  });

  await BlogPost.find({});
  await mongoose.disconnect();

  // Flush every query before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
