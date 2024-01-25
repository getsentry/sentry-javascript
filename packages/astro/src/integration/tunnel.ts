import type { APIRoute } from 'astro';
import { config } from 'virtual:@sentry/astro/tunnel-config';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const envelope = await request.text();
    const piece = envelope.split('\n')[0];
    const header = JSON.parse(piece);

    const dsn = new URL(header.dsn);
    if (dsn.hostname !== config.host) {
      throw new Error(`Invalid Sentry host: ${dsn.hostname}`);
    }

    const projectId = dsn.pathname.substring(1);
    if (!config.projectIds.includes(projectId)) {
      throw new Error(`Invalid Project ID: ${projectId}`);
    }

    const url = `https://${config.host}/api/${projectId}/envelope/`;
    const res = await fetch(url, {
      method: 'POST',
      body: envelope,
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    return Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ message: (error as Error).message }, { status: 400 });
  }
};
