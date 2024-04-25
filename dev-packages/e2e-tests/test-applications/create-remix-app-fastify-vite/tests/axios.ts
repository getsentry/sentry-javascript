
import { default as Axios } from 'axios';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;

export const axios = Axios.create(
  {
    baseURL: `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}`,
    headers: { Authorization: `Bearer ${authToken}` } }
  );

export { AxiosError } from "axios";
