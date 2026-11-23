export async function failingServerFunction(): Promise<void> {
  'use server';
  throw new Error('Error thrown from a server function in Solid 2 SSR E2E test app');
}
