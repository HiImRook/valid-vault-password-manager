package com.valid.vault;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

final class BrowserSettings {

    static final String ENGINE_STARTPAGE = "startpage";
    static final String ENGINE_DUCKDUCKGO = "duckduckgo";
    static final String ENGINE_BRAVE = "brave";
    static final Set<String> ENGINES = new HashSet<>(Arrays.asList(ENGINE_STARTPAGE, ENGINE_DUCKDUCKGO, ENGINE_BRAVE));
    static final List<Integer> GEN_MIN_CHOICES = Collections.unmodifiableList(Arrays.asList(16, 20));
    static final List<Integer> GEN_MAX_CHOICES = Collections.unmodifiableList(Arrays.asList(24, 32, 48, 64));
    static final int GEN_DEFAULT_MIN = 16;
    static final int GEN_DEFAULT_MAX = 24;

    private static final String FILE_NAME = "browser_settings.json";
    private static final String TEMP_PREFIX = "browser_settings.json.tmp.";
    private static final String LOCK_NAME = "browser_settings.lock";
    private static final int MAX_FILE_BYTES = 262144;
    private static final Object LOCK = new Object();

    String engine = ENGINE_STARTPAGE;
    int genMin = GEN_DEFAULT_MIN;
    int genMax = GEN_DEFAULT_MAX;
    final Set<String> allowedSites = new TreeSet<>();
    final List<BrowserPins.Pin> pins = new ArrayList<>();

    private BrowserSettings() {}

    static String searchUrl(String engine, String query) {
        String q;
        try { q = java.net.URLEncoder.encode(query, StandardCharsets.UTF_8.name()); } catch (Exception e) { q = ""; }
        if (ENGINE_DUCKDUCKGO.equals(engine)) return "https://duckduckgo.com/?q=" + q;
        if (ENGINE_BRAVE.equals(engine)) return "https://search.brave.com/search?q=" + q;
        return "https://www.startpage.com/do/search?q=" + q;
    }

    static String normalizeSite(String host) {
        if (host == null) return "";
        String h = host.trim().toLowerCase(Locale.ROOT);
        if (h.startsWith("www.")) h = h.substring(4);
        return h;
    }

    interface Change {
        void apply(BrowserSettings settings);
    }

    static BrowserSettings update(Context context, Change change) {
        synchronized (LOCK) {
            try (RandomAccessFile raf = new RandomAccessFile(new File(context.getFilesDir(), LOCK_NAME), "rw");
                 FileChannel channel = raf.getChannel();
                 FileLock lock = channel.lock()) {
                BrowserSettings settings = read(context);
                change.apply(settings);
                settings.write(context);
                return settings;
            } catch (Exception e) {
                return null;
            }
        }
    }

    static BrowserSettings load(Context context) {
        synchronized (LOCK) {
            return read(context);
        }
    }

    private static BrowserSettings read(Context context) {
        File file = new File(context.getFilesDir(), FILE_NAME);
        if (!file.exists() || file.length() > MAX_FILE_BYTES) return new BrowserSettings();
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] data = new byte[(int) file.length()];
            int read = 0;
            while (read < data.length) {
                int n = in.read(data, read, data.length - read);
                if (n < 0) break;
                read += n;
            }
            return parse(new String(data, 0, read, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new BrowserSettings();
        }
    }

    static BrowserSettings parse(String text) {
        BrowserSettings settings = new BrowserSettings();
        try {
            JSONObject json = new JSONObject(text);
            String engine = json.optString("engine", ENGINE_STARTPAGE);
            if (ENGINES.contains(engine)) settings.engine = engine;
            int min = json.optInt("genMin", GEN_DEFAULT_MIN);
            int max = json.optInt("genMax", GEN_DEFAULT_MAX);
            if (GEN_MIN_CHOICES.contains(min)) settings.genMin = min;
            if (GEN_MAX_CHOICES.contains(max)) settings.genMax = max;
            JSONArray sites = json.optJSONArray("allowedSites");
            if (sites != null) {
                for (int i = 0; i < sites.length(); i++) {
                    String site = normalizeSite(sites.optString(i, ""));
                    if (!site.isEmpty()) settings.allowedSites.add(site);
                }
            }
            JSONArray pinned = json.optJSONArray("pinned");
            if (pinned != null) {
                for (int i = 0; i < pinned.length(); i++) {
                    JSONObject pin = pinned.optJSONObject(i);
                    if (pin == null) continue;
                    BrowserPins.add(settings.pins, pin.optString("url", ""), pin.optString("title", ""));
                }
            }
        } catch (Exception e) {
            return new BrowserSettings();
        }
        return settings;
    }

    String serialize() throws Exception {
        JSONObject json = new JSONObject();
        json.put("engine", engine);
        json.put("genMin", genMin);
        json.put("genMax", genMax);
        JSONArray sites = new JSONArray();
        for (String site : allowedSites) sites.put(site);
        json.put("allowedSites", sites);
        JSONArray pinned = new JSONArray();
        for (BrowserPins.Pin pin : pins) {
            JSONObject entry = new JSONObject();
            entry.put("url", pin.url);
            entry.put("title", pin.title);
            pinned.put(entry);
        }
        json.put("pinned", pinned);
        return json.toString();
    }

    private void write(Context context) throws Exception {
        String text = serialize();
        File temp = new File(context.getFilesDir(), TEMP_PREFIX + android.os.Process.myPid());
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        File target = new File(context.getFilesDir(), FILE_NAME);
        if (!temp.renameTo(target)) {
            target.delete();
            if (!temp.renameTo(target)) throw new java.io.IOException("Could not save browser settings");
        }
    }
}
