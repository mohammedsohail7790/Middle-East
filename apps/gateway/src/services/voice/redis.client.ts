import { createRedisClient } from '../redis-connection.js';

export const voiceRedis = createRedisClient(undefined, { label: 'voice' });
