import { Routes } from '@angular/router';
import { UserComponent } from './user/user.component';
import { HomeComponent } from './home/home.component';
import { CancelComponent } from './cancel/cancel.components';
import { cancelGuard } from './cancel-guard.guard';
import { ComponentTrackingComponent } from './component-tracking/component-tracking.components';

export const routes: Routes = [
  {
    path: 'users/:id',
    component: UserComponent,
  },
  {
    path: 'home',
    component: HomeComponent,
  },
  {
    path: 'cancel',
    component: CancelComponent,
    canActivate: [cancelGuard],
  },
  {
    path: 'component-tracking',
    component: ComponentTrackingComponent,
  },
  {
    path: 'redirect1',
    redirectTo: '/redirect2',
  },
  {
    path: 'redirect2',
    redirectTo: '/redirect3',
  },
  {
    path: 'redirect3',
    redirectTo: '/users/456',
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
