import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/param/$id')({
  component: ParamPage,
});

function ParamPage() {
  const { id } = Route.useParams();
  return (
    <div>
      <p id="param-value">Param: {id}</p>
    </div>
  );
}
