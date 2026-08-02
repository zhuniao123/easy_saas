package com.example.lowcode.service;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Process-local metadata / options cache (L0/L1 placeholder).
 * Default TTL short; invalidate by key or tag after config writes.
 * Not a distributed cache — multi-instance must accept eventual consistency or disable.
 */
@Service
public class MetadataCacheService {
    private static final long DEFAULT_TTL_MS = 30_000L;

    private final ConcurrentHashMap<String, Entry> store = new ConcurrentHashMap<>();

    public <T> T getOrLoad(String key, Supplier<T> loader) {
        return getOrLoad(key, DEFAULT_TTL_MS, loader);
    }

    @SuppressWarnings("unchecked")
    public <T> T getOrLoad(String key, long ttlMs, Supplier<T> loader) {
        if (key == null || key.isBlank()) {
            return loader.get();
        }
        long now = System.currentTimeMillis();
        Entry existing = store.get(key);
        if (existing != null && existing.expiresAt > now) {
            return (T) existing.value;
        }
        T value = loader.get();
        store.put(key, new Entry(value, now + Math.max(1_000L, ttlMs)));
        return value;
    }

    public void invalidate(String key) {
        if (key != null) {
            store.remove(key);
        }
    }

    public void invalidatePrefix(String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return;
        }
        store.keySet().removeIf(k -> k.startsWith(prefix));
    }

    public void invalidateAll() {
        store.clear();
    }

    public Map<String, Object> stats() {
        return Map.of("size", store.size());
    }

    private static final class Entry {
        final Object value;
        final long expiresAt;

        Entry(Object value, long expiresAt) {
            this.value = value;
            this.expiresAt = expiresAt;
        }
    }
}
