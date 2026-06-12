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

      // Callback form (mongoose 5/6 only): the callback is passed as the sole argument, so it must
      // be forwarded in the correct position. Reject if the callback doesn't receive the saved doc.
      await new Promise((resolve, reject) => {
        new BlogPost({ title: 'Callback', body: 'cb', date: new Date() }).save((err, doc) => {
          if (err) {
            reject(err);
          } else if (!doc || doc.title !== 'Callback') {
            reject(new Error('save(callback) did not receive the saved document'));
          } else {
            resolve();
          }
        });
      });

      await BlogPost.aggregate([{ $match: {} }]);

      await BlogPost.insertMany([{ title: 'Insert', body: 'Insert body', date: new Date() }]);

      await BlogPost.bulkWrite([{ insertOne: { document: { title: 'Bulk', body: 'Bulk body', date: new Date() } } }]);

      // Failing operation: a save that violates required-field validation should still produce a
      // span, marked with an error status.
      const RequiredSchema = new Schema({ requiredField: { type: String, required: true } });
      const RequiredDoc = mongoose.model('RequiredDoc', RequiredSchema);
      await new RequiredDoc({}).save().catch(() => undefined);
    },
  );
}

run();
