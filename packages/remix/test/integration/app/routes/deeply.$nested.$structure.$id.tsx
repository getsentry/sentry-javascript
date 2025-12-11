import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return json({
    nested: params.nested,
    structure: params.structure,
    id: params.id,
    depth: 4,
  });
};

export default function DeeplyNested() {
  const data = useLoaderData<typeof loader>();

  return (
    <div>
      <h1>Deeply Nested Route Test (Flat Syntax)</h1>
      <p>Nested: {data.nested}</p>
      <p>Structure: {data.structure}</p>
      <p>ID: {data.id}</p>
      <p>Depth: {data.depth} levels</p>
    </div>
  );
}
