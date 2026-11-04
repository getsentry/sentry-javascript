import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/artists/')({
  component: ArtistsPage,
});

function ArtistsPage() {
  return <p>Artists</p>;
}
