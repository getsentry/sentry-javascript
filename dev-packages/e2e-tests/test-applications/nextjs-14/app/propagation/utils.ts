import http from 'http';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export function makeHttpRequest(url: string) {
  return new Promise(resolve => {
    const data: any[] = [];
    http
      .request(url, httpRes => {
        httpRes.on('data', chunk => {
          data.push(chunk);
        });
        httpRes.on('error', error => {
          resolve({ error: error.message, url });
        });
        httpRes.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(data).toString());
            resolve(json);
          } catch {
            resolve({ data: Buffer.concat(data).toString(), url });
          }
        });
      })
      .end();
  });
}

export async function checkHandler() {
  const headerList = await headers();

  const headerObj: Record<string, unknown> = {};
  headerList.forEach((value, key) => {
    headerObj[key] = value;
  });

  return NextResponse.json({ headers: headerObj });
}
