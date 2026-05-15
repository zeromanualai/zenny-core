import { Redis } from 'ioredis';
import { config } from '../config';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 2000);
  },
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

// Session helpers
export function sessionKey(clientId: string, userId: string): string {
  return `session:${clientId}:${userId}`;
}

export function asyncKey(sessionId: string): string {
  return `async:${sessionId}`;
}

export async function getSession(clientId: string, userId: string): Promise<any> {
  const key = sessionKey(clientId, userId);
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function saveSession(
  clientId: string,
  userId: string,
  session: any,
  ttl = 3600
): Promise<void> {
  const key = sessionKey(clientId, userId);
  await redis.setex(key, ttl, JSON.stringify(session));
}

export async function deleteSession(clientId: string, userId: string): Promise<void> {
  const key = sessionKey(clientId, userId);
  await redis.del(key);
}

// Cross-channel merge helpers
export async function findCrossChannelSession(
  clientId: string,
  identifiers: { email?: string; phone?: string }
): Promise<any | null> {
  const patterns = [`session:${clientId}:*`];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    for (const key of keys) {
      const data = await redis.get(key);
      if (!data) continue;
      const session = JSON.parse(data);
      if (
        (identifiers.email && session.slots?.email === identifiers.email) ||
        (identifiers.phone && session.slots?.phone === identifiers.phone)
      ) {
        return session;
      }
    }
  }
  return null;
}

// Async action helpers
export async function setAsyncAction(sessionId: string, actionData: any, ttl = 30): Promise<void> {
  const key = asyncKey(sessionId);
  await redis.setex(key, ttl, JSON.stringify({ ...actionData, status: 'pending' }));
}

export async function getAsyncAction(sessionId: string): Promise<any | null> {
  const key = asyncKey(sessionId);
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function clearAsyncAction(sessionId: string): Promise<void> {
  const key = asyncKey(sessionId);
  await redis.del(key);
}

// Cache helpers
export async function getCache(key: string): Promise<any> {
  const data = await redis.get(`cache:${key}`);
  return data ? JSON.parse(data) : null;
}

export async function setCache(key: string, value: any, ttl = 86400): Promise<void> {
  await redis.setex(`cache:${key}`, ttl, JSON.stringify(value));
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(`cache:${key}`);
}
