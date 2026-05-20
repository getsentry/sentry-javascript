import { LoaderFunction, json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export const loader: LoaderFunction = async ({ params }) => {
  return json({ productId: params.productId, reviewId: params.reviewId });
};

export default function ProductReview() {
  const data = useLoaderData<{ productId: string; reviewId: string }>();

  return (
    <div>
      <h1>
        Product {data.productId} / Review {data.reviewId}
      </h1>
    </div>
  );
}
