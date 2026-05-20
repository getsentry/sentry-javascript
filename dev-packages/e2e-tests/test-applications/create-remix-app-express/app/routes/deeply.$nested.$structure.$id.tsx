import { LoaderFunction, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader: LoaderFunction = async ({ params }) => {
  return json({ nested: params.nested, structure: params.structure, id: params.id });
};

export default function Deeply() {
  const data = useLoaderData<{ nested: string; structure: string; id: string }>();

  return (
    <div>
      <h1>
        {data.nested}/{data.structure}/{data.id}
      </h1>
    </div>
  );
}
