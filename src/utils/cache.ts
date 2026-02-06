import { LRUCache } from 'lru-cache';

export interface CacheOptions {
  /** Maximum number of items */
  max?: number;
  /** Time to live in milliseconds */
  ttl?: number;
}

/**
 * Create a typed LRU cache
 */
export function createCache<K extends string | number, V>(
  options: CacheOptions = {}
): LRUCache<K, V> {
  return new LRUCache<K, V>({
    max: options.max ?? 1000,
    ttl: options.ttl ?? 5 * 60 * 1000, // 5 minutes default
  });
}

// Tool result cache - 5 minute TTL
export const toolResultCache = createCache<string, string>({
  max: 500,
  ttl: 5 * 60 * 1000,
});

/**
 * Generate a cache key for tool results
 */
export function getToolCacheKey(
  toolName: string,
  args: Record<string, unknown>
): string {
  const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
  return `${toolName}:${sortedArgs}`;
}
