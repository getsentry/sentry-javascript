import { simulateCLS } from '../../../../utils/web-vitals/cls.ts';

simulateCLS(0.15).then(() => window.dispatchEvent(new Event('cls-done')));
