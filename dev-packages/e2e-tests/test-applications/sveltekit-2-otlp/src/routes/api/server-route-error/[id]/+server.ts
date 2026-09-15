export const GET = ({ params }) => {
  throw new Error(`This is a server route error with id ${params.id}`);
};
