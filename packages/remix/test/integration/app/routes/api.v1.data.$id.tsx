import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return json({
    id: params.id,
    api_version: 'v1',
    data: { nested: true, level: 3 },
  });
};
