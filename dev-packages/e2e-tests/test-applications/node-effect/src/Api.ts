import { HttpApi } from '@effect/platform';
import { TestApi } from './Test/Api.js';

export class Api extends HttpApi.make('api').add(TestApi) {}
