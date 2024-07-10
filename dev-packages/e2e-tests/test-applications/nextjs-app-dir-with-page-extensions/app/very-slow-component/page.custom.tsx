export const dynamic = 'force-dynamic';

export default async function SuperSlowPage() {
  await new Promise(resolve => setTimeout(resolve, 10000));
  return null;
}
