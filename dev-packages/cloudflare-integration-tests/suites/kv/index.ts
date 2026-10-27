import type { KVNamespace } from '@cloudflare/workers-types';

interface Env {
  MY_KV: KVNamespace;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/kv/get') {
      await env.MY_KV.put('get-key', 'get-value');
      const value = await env.MY_KV.get('get-key');
      return new Response(value);
    }

    if (url.pathname === '/kv/get-miss') {
      const value = await env.MY_KV.get('missing-key');
      return new Response(value ?? 'miss');
    }

    if (url.pathname === '/kv/bulk-get') {
      await env.MY_KV.put('bulk-a', 'a');
      await env.MY_KV.put('bulk-b', 'b');
      const values = await env.MY_KV.get(['bulk-a', 'bulk-b']);
      return Response.json(Object.fromEntries(values));
    }

    if (url.pathname === '/kv/get-with-metadata') {
      await env.MY_KV.put('metadata-key', 'metadata-value', { metadata: { source: 'test' } });
      const value = await env.MY_KV.getWithMetadata('metadata-key');
      return Response.json(value);
    }

    if (url.pathname === '/kv/put') {
      await env.MY_KV.put('put-key', 'put-value');
      return new Response('OK');
    }

    if (url.pathname === '/kv/list') {
      await env.MY_KV.put('list-a', 'a');
      await env.MY_KV.put('list-b', 'b');
      await env.MY_KV.list({ prefix: 'list-' });
      return new Response('OK');
    }

    if (url.pathname === '/kv/delete') {
      await env.MY_KV.put('delete-key', 'gone');
      await env.MY_KV.delete('delete-key');
      return new Response('OK');
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
