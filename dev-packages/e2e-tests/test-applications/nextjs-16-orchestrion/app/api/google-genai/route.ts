import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { getMockAiPort } from '../../../ai-mock-server.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const port = await getMockAiPort();
  const client = new GoogleGenAI({
    apiKey: 'mock-api-key',
    httpOptions: { baseUrl: `http://localhost:${port}` },
  });

  await client.models.generateContent({
    model: 'gemini-1.5-flash',
    config: { temperature: 0.7, topP: 0.9, maxOutputTokens: 100 },
    contents: [{ role: 'user', parts: [{ text: 'What is the capital of France?' }] }],
  });

  return NextResponse.json({ status: 'ok' });
}
