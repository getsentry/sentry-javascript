export const dynamic = 'force-dynamic';

export default function Page() {
  if (Math.random() > -1) {
    throw new Error('page rsc render error');
  }

  return null;
}
