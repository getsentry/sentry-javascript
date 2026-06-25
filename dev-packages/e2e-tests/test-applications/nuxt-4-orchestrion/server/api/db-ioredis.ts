import mysql from 'mysql';
import { defineEventHandler } from '#imports';
import Redis from "ioredis";

export default defineEventHandler((event) => {
  const redis = new Redis();

  redis.set("test-key", "test-value");

  return redis.get("test-key");
});
