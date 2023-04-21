export const config = { runtime: 'experimental-edge' };

export default () =>
  new Response(
    JSON.stringify({
      name: 'Jim Halpert',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    },
  );
