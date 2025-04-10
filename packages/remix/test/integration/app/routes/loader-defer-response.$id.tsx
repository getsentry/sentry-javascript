import { LoaderFunctionArgs, defer } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader = async ({ params: { id } }: LoaderFunctionArgs) => {
  return defer({
    id,
  });
};

export default function LoaderJSONResponse() {
  const data = useLoaderData<typeof loader>();

  return (
    <div>
      <h1 id="data-render">{data?.id ? data.id : 'Not Found'}</h1>
    </div>
  );
}
