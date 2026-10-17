package com.valid.vault;

import java.util.List;
import java.util.Locale;

final class BrowserPins {

    static final int MAX_PINS = 12;
    static final int MAX_TITLE_LENGTH = 40;
    static final int MAX_URL_LENGTH = 2048;

    static final class Pin {
        final String url;
        final String title;

        Pin(String url, String title) {
            this.url = url;
            this.title = title;
        }
    }

    private BrowserPins() {}

    static String normalizeUrl(String url) {
        if (url == null) return null;
        String value = url.trim();
        if (value.isEmpty() || value.length() > MAX_URL_LENGTH) return null;
        String lower = value.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("https://") && !lower.startsWith("http://")) return null;
        if (BrowserPrivacy.hostOf(value).isEmpty()) return null;
        int hash = value.indexOf('#');
        if (hash >= 0) value = value.substring(0, hash);
        return value;
    }

    private static String sameKey(String url) {
        String key = url.toLowerCase(Locale.ROOT);
        while (key.endsWith("/")) key = key.substring(0, key.length() - 1);
        if (key.startsWith("http://")) key = key.substring(7);
        else if (key.startsWith("https://")) key = key.substring(8);
        if (key.startsWith("www.")) key = key.substring(4);
        return key;
    }

    static String cleanTitle(String title) {
        if (title == null) return "";
        String value = title.replaceAll("\\s+", " ").trim();
        if (value.length() > MAX_TITLE_LENGTH) value = value.substring(0, MAX_TITLE_LENGTH).trim();
        return value;
    }

    static String hostLabel(String url) {
        String host = BrowserPrivacy.hostOf(url);
        if (host.startsWith("www.")) host = host.substring(4);
        return host;
    }

    static String label(Pin pin) {
        return pin.title.isEmpty() ? hostLabel(pin.url) : pin.title;
    }

    static String letter(Pin pin) {
        String host = hostLabel(pin.url);
        for (int i = 0; i < host.length(); i++) {
            char c = host.charAt(i);
            if (Character.isLetterOrDigit(c)) return String.valueOf(Character.toUpperCase(c));
        }
        return "#";
    }

    static int indexOf(List<Pin> pins, String url) {
        String normalized = normalizeUrl(url);
        if (normalized == null) return -1;
        String key = sameKey(normalized);
        for (int i = 0; i < pins.size(); i++) if (sameKey(pins.get(i).url).equals(key)) return i;
        return -1;
    }

    static boolean contains(List<Pin> pins, String url) {
        return indexOf(pins, url) >= 0;
    }

    static boolean add(List<Pin> pins, String url, String title) {
        String normalized = normalizeUrl(url);
        if (normalized == null || pins.size() >= MAX_PINS || contains(pins, normalized)) return false;
        pins.add(new Pin(normalized, cleanTitle(title)));
        return true;
    }

    static String fromInput(String input) {
        if (input == null) return null;
        String value = input.trim();
        if (value.isEmpty() || value.contains(" ")) return null;
        if (!value.contains("://")) value = "https://" + value;
        String url = normalizeUrl(value);
        if (url == null) return null;
        String host = BrowserPrivacy.hostOf(url);
        if (!host.contains(".") || host.startsWith(".") || host.endsWith(".")) return null;
        return url;
    }

    static boolean move(List<Pin> pins, String url, int to) {
        int from = indexOf(pins, url);
        if (from < 0 || pins.isEmpty()) return false;
        int target = Math.max(0, Math.min(to, pins.size() - 1));
        if (target == from) return false;
        Pin pin = pins.remove(from);
        pins.add(target, pin);
        return true;
    }

    static boolean remove(List<Pin> pins, String url) {
        int index = indexOf(pins, url);
        if (index < 0) return false;
        pins.remove(index);
        return true;
    }
}
