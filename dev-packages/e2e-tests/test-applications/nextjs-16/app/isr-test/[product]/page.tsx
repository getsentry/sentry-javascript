export async function generateStaticParams(): Promise<Array<{ product: string }>> {
  return [{ product: 'laptop' }, { product: 'phone' }, { product: 'tablet' }];
}

export default async function ISRProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;

  return (
    <div>
      <h1>ISR Product: {product}</h1>
      <div id="isr-product-id">{product}</div>
    </div>
  );
}
