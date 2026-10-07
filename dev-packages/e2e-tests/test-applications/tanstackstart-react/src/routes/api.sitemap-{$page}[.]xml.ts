import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/sitemap-{$page}.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return new Response(`<sitemap page="${params.page}" />`, {
          headers: { 'Content-Type': 'application/xml' },
        });
      },
    },
  },
});
