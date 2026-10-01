import { defineEventHandler } from '#imports';
import mongoose from 'mongoose';

const BlogPost = mongoose.model('BlogPost', new mongoose.Schema({ title: String }));

// SCRAM-SHA-1 on purpose: this handshake lazily `require()`s the `crypto` builtin inside a try
// block, which only works when the bundled driver gets a real interop for builtin requires (#24775).
const MONGO_URL = 'mongodb://root:docker@127.0.0.1:27017/test?authSource=admin&authMechanism=SCRAM-SHA-1';

export default defineEventHandler(async () => {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
    await mongoose.connect(MONGO_URL);
  }

  await new BlogPost({ title: 'test-post' }).save();
  const found = await BlogPost.findOne({ title: 'test-post' });

  return { title: found?.title };
});
