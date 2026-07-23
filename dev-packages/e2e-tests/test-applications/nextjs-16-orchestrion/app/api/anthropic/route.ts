import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getMockAiPort } from '../../../ai-mock-server.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const port = await getMockAiPort();
  const client = new Anthropic({
    apiKey: 'mock-api-key',
    baseURL: `http://localhost:${port}/anthropic`,
  });

  await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
  });

  return NextResponse.json({ status: 'ok' });
}
