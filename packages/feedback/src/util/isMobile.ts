import { NAVIGATOR } from '../constants';
/**
 * Returns if it's a mobile browser
 */
export function isMobile(): boolean {
  return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(NAVIGATOR.userAgent));
}
