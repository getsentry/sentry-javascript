import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { MOCK_AI_PORT } from '../../../ai-mock-server.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = new OpenAI({
    baseURL: `http://localhost:${MOCK_AI_PORT}/openai`,
    apiKey: 'mock-api-key',
  });

  await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
  });

  return NextResponse.json({ status: 'ok' });
}
