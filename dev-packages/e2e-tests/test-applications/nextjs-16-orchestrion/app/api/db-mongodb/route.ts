import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = new MongoClient('mongodb://localhost:27017');

  try {
    await client.connect();
    const collection = client.db('admin').collection('movies');

    await collection.insertOne({ title: 'Rear Window' });
    await collection.findOne({ title: 'Rear Window' });

    return NextResponse.json({ status: 'ok' });
  } finally {
    await client.close();
  }
}
