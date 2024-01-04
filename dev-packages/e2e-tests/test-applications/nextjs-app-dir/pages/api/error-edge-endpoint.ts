export const config = { runtime: 'edge' };

export default () => {
  throw new Error('Edge Route Error');
};
