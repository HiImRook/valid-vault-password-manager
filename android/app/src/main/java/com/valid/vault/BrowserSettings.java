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
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

final class BrowserSettings {

    static final String ENGINE_STARTPAGE = "startpage";
    static final String ENGINE_DUCKDUCKGO = "duckduckgo";
    static final String ENGINE_BRAVE = "brave";
    static final Set<String> ENGINES = new HashSet<>(Arrays.asList(ENGINE_STARTPAGE, ENGINE_DUCKDUCKGO, ENGINE_BRAVE));

    private static final String FILE_NAME = "browser_settings.json";
    private static final String TEMP_PREFIX = "browser_settings.json.tmp.";
    private static final String LOCK_NAME = "browser_settings.lock";
    private static final int MAX_FILE_BYTES = 262144;
    private static final Object LOCK = new Object();

    String engine = ENGINE_STARTPAGE;
    final Set<String> allowedSites = new TreeSet<>();

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
        BrowserSettings settings = new BrowserSettings();
        File file = new File(context.getFilesDir(), FILE_NAME);
        if (!file.exists() || file.length() > MAX_FILE_BYTES) return settings;
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] data = new byte[(int) file.length()];
            int read = 0;
            while (read < data.length) {
                int n = in.read(data, read, data.length - read);
                if (n < 0) break;
                read += n;
            }
            JSONObject json = new JSONObject(new String(data, 0, read, StandardCharsets.UTF_8));
            String engine = json.optString("engine", ENGINE_STARTPAGE);
            if (ENGINES.contains(engine)) settings.engine = engine;
            JSONArray sites = json.optJSONArray("allowedSites");
            if (sites != null) {
                for (int i = 0; i < sites.length(); i++) {
                    String site = normalizeSite(sites.optString(i, ""));
                    if (!site.isEmpty()) settings.allowedSites.add(site);
                }
            }
        } catch (Exception e) {
            return new BrowserSettings();
        }
        return settings;
    }

    private void write(Context context) throws Exception {
        JSONObject json = new JSONObject();
        json.put("engine", engine);
        JSONArray sites = new JSONArray();
        for (String site : allowedSites) sites.put(site);
        json.put("allowedSites", sites);
        File temp = new File(context.getFilesDir(), TEMP_PREFIX + android.os.Process.myPid());
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        File target = new File(context.getFilesDir(), FILE_NAME);
        if (!temp.renameTo(target)) {
            target.delete();
            if (!temp.renameTo(target)) throw new java.io.IOException("Could not save browser settings");
        }
    }
}
