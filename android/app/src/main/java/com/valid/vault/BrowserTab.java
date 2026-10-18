package com.valid.vault;

import android.webkit.WebView;

import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

final class BrowserTab {

    final int id;
    final int seed;
    final AtomicInteger blockedCount = new AtomicInteger(0);
    final AtomicInteger blockedQueued = new AtomicInteger(0);
    final ConcurrentLinkedQueue<String> blockedUrls = new ConcurrentLinkedQueue<>();
    final AtomicBoolean collapseScheduled = new AtomicBoolean(false);
    volatile String pageHost = "";
    volatile WebView web = null;
    Runnable collapse = null;
    Runnable savePrompt = null;
    BrowserFill.Save pendingSave = null;
    String pendingSaveHost = null;
    long pendingSaveAt = 0;
    volatile long lastTouchAt = 0;
    boolean start = true;
    boolean fromStart = true;
    String title = "";
    String url = "";

    BrowserTab(int id, int seed) {
        this.id = id;
        this.seed = seed;
    }

    void resetPage() {
        blockedCount.set(0);
        blockedQueued.set(0);
        blockedUrls.clear();
    }
}
