import DataLoader from 'dataloader';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const loader = new DataLoader<string, number>(async keys => keys.map((_, idx) => idx), {
    cache: false,
    name: 'usersLoader',
  });

  const user = await loader.load('user-1');

  return NextResponse.json({ user });
}
