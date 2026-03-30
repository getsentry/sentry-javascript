'use server';

// This file only has a default export — the Sentry plugin should wrap it as
// a default server function, NOT extract "defaultAction" as a named export.
export default async function defaultAction(formData: FormData): Promise<{ success: boolean; message: string }> {
  const name = formData.get('name') as string;
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    success: true,
    message: `Default: Hello, ${name}!`,
  };
}
