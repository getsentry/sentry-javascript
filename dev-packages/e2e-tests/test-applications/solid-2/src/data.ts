'use server';

export async function getPrefecture(id: number): Promise<{ prefecture: string; id: number }> {
  await new Promise(resolve => setTimeout(resolve, 20));
  return { prefecture: 'Kagoshima', id };
}

export async function explode(): Promise<never> {
  throw new Error('Error thrown from Solid 2 E2E test app server function');
}
