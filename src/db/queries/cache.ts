// src/db/queries/cache.ts
// LLM cache query functions

import { getDatabase } from '../database';
import * as Crypto from 'expo-crypto';

export interface DbLLMCache {
    cacheKey: string;
    feature: string;
    datasetId: string;
    modelHint: string | null;
    payloadHash: string;
    responseJson: string;
    createdAt: number;
    expireAt: number;
    hitCount: number;
}

// ============ Cache Key Generation ============

export async function generateCacheKey(
    feature: string,
    datasetId: string,
    modelHint: string | null,
    payload: object
): Promise<{ cacheKey: string; payloadHash: string }> {
    const payloadStr = JSON.stringify(payload);
    const payloadHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        payloadStr
    );

    const keyInput = `${feature}|${datasetId}|${modelHint || ''}|${payloadHash}`;
    const cacheKey = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        keyInput
    );

    return { cacheKey, payloadHash };
}

// ============ Cache Operations ============

export async function getCachedResponse(cacheKey: string): Promise<DbLLMCache | null> {
    const db = await getDatabase();
    const now = Date.now();

    const cache = await db.getFirstAsync<DbLLMCache>(
        'SELECT * FROM llm_cache WHERE cacheKey = ? AND expireAt > ?',
        [cacheKey, now]
    );

    if (cache) {
        // Increment hit count
        await db.runAsync(
            'UPDATE llm_cache SET hitCount = hitCount + 1 WHERE cacheKey = ?',
            [cacheKey]
        );
        console.log(`[LLM Cache] HIT: ${cache.feature} (hits: ${cache.hitCount + 1})`);
    }

    return cache;
}

export async function setCachedResponse(
    cacheKey: string,
    feature: string,
    datasetId: string,
    modelHint: string | null,
    payloadHash: string,
    response: object,
    ttlMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
): Promise<void> {
    const db = await getDatabase();
    const now = Date.now();

    await db.runAsync(
        `INSERT OR REPLACE INTO llm_cache 
     (cacheKey, feature, datasetId, modelHint, payloadHash, responseJson, createdAt, expireAt, hitCount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
            cacheKey,
            feature,
            datasetId,
            modelHint,
            payloadHash,
            JSON.stringify(response),
            now,
            now + ttlMs,
        ]
    );

    console.log(`[LLM Cache] SET: ${feature}`);
}

export async function invalidateCache(feature?: string): Promise<number> {
    const db = await getDatabase();

    if (feature) {
        const result = await db.runAsync(
            'DELETE FROM llm_cache WHERE feature = ?',
            [feature]
        );
        return result.changes;
    } else {
        const result = await db.runAsync('DELETE FROM llm_cache');
        return result.changes;
    }
}

export async function cleanExpiredCache(): Promise<number> {
    const db = await getDatabase();
    const now = Date.now();

    const result = await db.runAsync(
        'DELETE FROM llm_cache WHERE expireAt <= ?',
        [now]
    );

    if (result.changes > 0) {
        console.log(`[LLM Cache] Cleaned ${result.changes} expired entries`);
    }

    return result.changes;
}

export async function getCacheStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    byFeature: Record<string, { count: number; hits: number }>;
}> {
    const db = await getDatabase();

    const all = await db.getAllAsync<DbLLMCache>('SELECT * FROM llm_cache');

    const byFeature: Record<string, { count: number; hits: number }> = {};
    let totalHits = 0;

    for (const entry of all) {
        totalHits += entry.hitCount;

        if (!byFeature[entry.feature]) {
            byFeature[entry.feature] = { count: 0, hits: 0 };
        }
        byFeature[entry.feature].count++;
        byFeature[entry.feature].hits += entry.hitCount;
    }

    return {
        totalEntries: all.length,
        totalHits,
        byFeature,
    };
}
