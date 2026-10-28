import { monitorSlugs } from './monitorSlugs';

interface Env {
  SERVER_URL: string;
}

export default {
  async scheduled(controller, env) {
    switch (monitorSlugs[controller.cron]) {
      case 'daily-report':
        await fetch(env.SERVER_URL);
        break;
      case 'sync-inventory':
        throw new Error('Boom from sync-inventory');
    }
  },
} satisfies ExportedHandler<Env>;
