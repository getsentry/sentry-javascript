export const prerender = false;

export function GET({ params }) {
  return new Response(
    JSON.stringify({
      greeting: `Hello ${params.userId}`,
      userId: params.userId,
    }),
  );
}
