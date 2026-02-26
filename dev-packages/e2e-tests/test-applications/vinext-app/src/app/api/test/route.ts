export async function GET() {
  return new Response(JSON.stringify({ message: 'Hello from vinext API!' }), {
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST() {
  throw new Error('API Route Error');
}
