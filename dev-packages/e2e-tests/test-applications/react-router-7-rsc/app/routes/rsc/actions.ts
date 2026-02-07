'use server';

export async function submitForm(formData: FormData): Promise<{ success: boolean; message: string }> {
  const name = formData.get('name') as string;

  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 50));

  return {
    success: true,
    message: `Hello, ${name}! Form submitted successfully.`,
  };
}

export async function submitFormWithError(_formData: FormData): Promise<{ success: boolean; message: string }> {
  // Simulate an error in server function
  throw new Error('RSC Server Function Error: Something went wrong!');
}

export const submitFormArrow = async (formData: FormData): Promise<{ success: boolean; message: string }> => {
  const name = formData.get('name') as string;
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    success: true,
    message: `Arrow: Hello, ${name}!`,
  };
};
