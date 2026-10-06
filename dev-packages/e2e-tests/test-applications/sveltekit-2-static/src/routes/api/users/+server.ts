export const GET = () => {
  return new Response(JSON.stringify({ users: ['alice', 'bob', 'carol'] }));
};
