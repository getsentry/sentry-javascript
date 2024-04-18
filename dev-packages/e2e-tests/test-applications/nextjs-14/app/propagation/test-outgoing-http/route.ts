import http from 'http';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await makeHttpRequest(`http://localhost:3030/propagation/test-outgoing-http/check`);
  return NextResponse.json(data);
}

function makeHttpRequest(url: string) {
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
