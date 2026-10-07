import { forbidden } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function GET() {
  forbidden();
}
