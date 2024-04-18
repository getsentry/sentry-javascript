import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const headerList = headers();

  const headerObj: Record<string, unknown> = {};
  headerList.forEach((value, key) => {
    headerObj[key] = value;
  });

  return NextResponse.json({ headers: headerObj });
}
