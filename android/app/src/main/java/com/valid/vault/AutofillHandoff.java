package com.valid.vault;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

final class AutofillHandoff {

    private static final long TTL_MS = 120000;
    private static final int TOKEN_BYTES = 16;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Map<String, Entry> ENTRIES = new HashMap<>();

    static final class Entry {
        final String username;
        final String password;
        final long expiresAt;

        Entry(String username, String password, long expiresAt) {
            this.username = username;
            this.password = password;
            this.expiresAt = expiresAt;
        }
    }

    private AutofillHandoff() {}

    private static void prune(long now) {
        Iterator<Map.Entry<String, Entry>> it = ENTRIES.entrySet().iterator();
        while (it.hasNext()) if (it.next().getValue().expiresAt < now) it.remove();
    }

    static synchronized String put(String username, String password) {
        long now = SystemClock.elapsedRealtime();
        prune(now);
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        StringBuilder token = new StringBuilder();
        for (byte b : bytes) token.append(String.format("%02x", b));
        String key = token.toString();
        ENTRIES.put(key, new Entry(username, password, now + TTL_MS));
        new Handler(Looper.getMainLooper()).postDelayed(() -> expire(key), TTL_MS);
        return key;
    }

    private static synchronized void expire(String token) {
        ENTRIES.remove(token);
    }

    static synchronized Entry take(String token) {
        if (token == null) return null;
        long now = SystemClock.elapsedRealtime();
        prune(now);
        return ENTRIES.remove(token);
    }
}
