import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Env = { DB: { prepare(query: string): { all(): Promise<{ results: unknown[] }> } } };

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const { results } = await (env as unknown as Env).DB.prepare('SELECT 1 AS one').all();
  return NextResponse.json(results);
}
