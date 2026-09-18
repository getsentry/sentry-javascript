#!/usr/bin/env node
import { AwsLambdaExtension } from './aws-lambda-extension';
import { main } from './main';

void main(new AwsLambdaExtension());
