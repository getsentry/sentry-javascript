export const load = async ({ params }) => {
  return {
    msg: `This is a special message for user ${params.id}`,
  };
};
