import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ result: 'static response' });
}

// This export makes it so that this route is always dynamically rendered (i.e Sentry will trace)
export const revalidate = 0;

// This export makes it so that this route will throw an error if the Request object is accessed in some way.
export const dynamic = 'error';
