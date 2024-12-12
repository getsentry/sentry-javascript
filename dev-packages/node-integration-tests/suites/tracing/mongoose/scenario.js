const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

// Must be required after Sentry is initialized
const mongoose = require('mongoose');

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

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
