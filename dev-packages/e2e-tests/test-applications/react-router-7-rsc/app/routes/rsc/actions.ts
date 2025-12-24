'use server';

import { wrapServerFunction } from '@sentry/react-router';

async function _submitForm(formData: FormData): Promise<{ success: boolean; message: string }> {
  const name = formData.get('name') as string;

  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 50));

  return {
    success: true,
    message: `Hello, ${name}! Form submitted successfully.`,
  };
}

export const submitForm = wrapServerFunction('submitForm', _submitForm);

async function _submitFormWithError(_formData: FormData): Promise<{ success: boolean; message: string }> {
  // Simulate an error in server function
  throw new Error('RSC Server Function Error: Something went wrong!');
}

export const submitFormWithError = wrapServerFunction('submitFormWithError', _submitFormWithError);

async function _getData(): Promise<{ timestamp: number; data: string }> {
  await new Promise(resolve => setTimeout(resolve, 20));

  return {
    timestamp: Date.now(),
    data: 'Fetched from server function',
  };
}

export const getData = wrapServerFunction('getData', _getData);
