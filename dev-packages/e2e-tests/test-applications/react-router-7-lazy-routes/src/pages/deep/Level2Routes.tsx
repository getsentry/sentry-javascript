// Delay: 300ms before module loads
await new Promise(resolve => setTimeout(resolve, 300));

export const level3Routes = [
  {
    path: 'level3/:id',
    lazy: async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      return {
        Component: (await import('./Level3')).default,
      };
    },
  },
];
