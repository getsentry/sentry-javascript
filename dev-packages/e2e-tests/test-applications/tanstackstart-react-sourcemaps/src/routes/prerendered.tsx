import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/prerendered')({
  component: Prerendered,
});

function Prerendered() {
  return <p>Prerendered at build time</p>;
}
