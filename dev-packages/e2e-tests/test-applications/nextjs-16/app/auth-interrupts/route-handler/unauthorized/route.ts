import { unauthorized } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function GET() {
  unauthorized();
}
