import mongoose, { Schema } from 'mongoose';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // The `test` database matches the mongoose scenario in node-integration-tests.
  await mongoose.connect('mongodb://localhost:27017/test');

  // Guard against model recompilation across requests in the same worker.
  const BlogPost = mongoose.models.BlogPost || mongoose.model('BlogPost', new Schema({ title: String }));

  try {
    const post = new BlogPost({ title: 'Rear Window' });
    await post.save();
    await BlogPost.findOne({ title: 'Rear Window' });

    return NextResponse.json({ status: 'ok' });
  } finally {
    await mongoose.disconnect();
  }
}
