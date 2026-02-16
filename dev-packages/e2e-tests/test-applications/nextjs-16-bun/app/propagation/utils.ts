import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function checkHandler() {
  const headerList = await headers();

  const headerObj: Record<string, unknown> = {};
  headerList.forEach((value, key) => {
    headerObj[key] = value;
  });

  return NextResponse.json({ headers: headerObj });
}
