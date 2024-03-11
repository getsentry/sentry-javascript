import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { UserComponent } from './user/user.component';

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
