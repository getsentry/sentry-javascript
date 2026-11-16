import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/anchor')({
  server: { handlers: { GET: () => Response.json({ ok: true }) } },
});
