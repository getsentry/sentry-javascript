import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';

export const cancelGuard: CanActivateFn = (_next: ActivatedRouteSnapshot, _state: RouterStateSnapshot) => {
  return false;
};
