export const dynamic = 'force-dynamic';

export default async function SuperSlowPage() {
  await new Promise(resolve => setTimeout(resolve, 5000));
  return null;
}
