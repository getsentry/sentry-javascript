export const load = ({ params }) => {
  throw new Error(`This is a server load error with id ${params.id}`);
};
