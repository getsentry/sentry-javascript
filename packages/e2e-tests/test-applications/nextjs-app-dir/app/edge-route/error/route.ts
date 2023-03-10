export async function GET() {
  throw new Error('I am an error inside an edge route!');
}

export const runtime = 'experimental-edge';
