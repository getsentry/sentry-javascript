import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader = async ({ params }: LoaderFunctionArgs) => {
  return json({
    productId: params.productId,
    reviewId: params.reviewId,
    pattern: 'flat-dot-notation',
  });
};

export default function ProductReview() {
  const data = useLoaderData<typeof loader>();

  return (
    <div>
      <h1>Flat Route Pattern Test</h1>
      <p>Product ID: {data.productId}</p>
      <p>Review ID: {data.reviewId}</p>
      <p>Pattern: {data.pattern}</p>
    </div>
  );
}
