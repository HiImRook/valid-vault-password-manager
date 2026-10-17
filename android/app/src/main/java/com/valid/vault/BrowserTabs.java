package com.valid.vault;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.IntSupplier;

final class BrowserTabs {

    static final int MAX_TABS = 15;

    enum Back { HIDE_KEYBOARD, CLOSE_SWITCHER, WEB_BACK, SHOW_START, CLOSE_TAB, FINISH }

    private final List<BrowserTab> tabs = new ArrayList<>();
    private final IntSupplier seeds;
    private int active = -1;
    private int nextId = 1;

    BrowserTabs(IntSupplier seeds) {
        this.seeds = seeds;
    }

    int size() {
        return tabs.size();
    }

    boolean full() {
        return tabs.size() >= MAX_TABS;
    }

    List<BrowserTab> list() {
        return Collections.unmodifiableList(tabs);
    }

    BrowserTab active() {
        return active >= 0 && active < tabs.size() ? tabs.get(active) : null;
    }

    int activeIndex() {
        return active;
    }

    BrowserTab find(int id) {
        for (BrowserTab tab : tabs) if (tab.id == id) return tab;
        return null;
    }

    BrowserTab open() {
        if (full()) return null;
        BrowserTab tab = new BrowserTab(nextId++, seeds.getAsInt());
        tabs.add(tab);
        active = tabs.size() - 1;
        return tab;
    }

    BrowserTab select(int id) {
        for (int i = 0; i < tabs.size(); i++) {
            if (tabs.get(i).id == id) {
                active = i;
                return tabs.get(i);
            }
        }
        return active();
    }

    BrowserTab close(int id) {
        int index = -1;
        for (int i = 0; i < tabs.size(); i++) if (tabs.get(i).id == id) index = i;
        if (index < 0) return null;
        BrowserTab closed = tabs.remove(index);
        if (tabs.isEmpty()) active = -1;
        else if (index < active) active--;
        else if (index == active) active = Math.min(index, tabs.size() - 1);
        return closed;
    }

    List<BrowserTab> clear() {
        List<BrowserTab> removed = new ArrayList<>(tabs);
        tabs.clear();
        active = -1;
        return removed;
    }

    static Back back(boolean switcherOpen, boolean keyboard, boolean onStart, boolean hasPage, boolean canGoBack, boolean fromStart, int tabCount) {
        if (switcherOpen) return Back.CLOSE_SWITCHER;
        if (keyboard) return Back.HIDE_KEYBOARD;
        if (!onStart && hasPage && canGoBack) return Back.WEB_BACK;
        if (!onStart && (fromStart || tabCount <= 1)) return Back.SHOW_START;
        if (tabCount > 1) return Back.CLOSE_TAB;
        return Back.FINISH;
    }
}
