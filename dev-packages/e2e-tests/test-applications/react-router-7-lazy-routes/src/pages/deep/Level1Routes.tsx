// Delay: 300ms before module loads
await new Promise(resolve => setTimeout(resolve, 300));

export const level2Routes = [
  {
    path: 'level2',
    handle: {
      lazyChildren: () => import('./Level2Routes').then(module => module.level3Routes),
    },
  },
];
