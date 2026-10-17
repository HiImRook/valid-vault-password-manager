package com.valid.vault;

import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.URLUtil;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.regex.Pattern;

final class BrowserDownloads {

    private static final int MAX_NAME_LENGTH = 120;
    private static final String FALLBACK_NAME = "download";
    private static final Pattern UNSAFE_NAME = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    private BrowserDownloads() {}

    static boolean downloadable(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    static String fileName(String url, String contentDisposition, String mimeType) {
        String guessed;
        try {
            guessed = URLUtil.guessFileName(url, contentDisposition, mimeType);
        } catch (Exception e) {
            guessed = null;
        }
        String name = guessed == null ? "" : UNSAFE_NAME.matcher(guessed).replaceAll("_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.isEmpty()) name = FALLBACK_NAME;
        if (name.length() > MAX_NAME_LENGTH) {
            int dot = name.lastIndexOf('.');
            String ext = dot > 0 && name.length() - dot <= 10 ? name.substring(dot) : "";
            name = name.substring(0, MAX_NAME_LENGTH - ext.length()) + ext;
        }
        return name;
    }

    static String originOf(String pageUrl) {
        if (!downloadable(pageUrl)) return null;
        try {
            Uri uri = Uri.parse(pageUrl);
            if (uri.getScheme() == null || uri.getHost() == null) return null;
            String port = uri.getPort() > 0 ? ":" + uri.getPort() : "";
            return uri.getScheme() + "://" + uri.getHost() + port + "/";
        } catch (Exception e) {
            return null;
        }
    }

    static boolean saveImage(Context context, String name, byte[] png) {
        if (png == null || png.length == 0) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, "image/png");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (item == null) return false;
                try (OutputStream out = resolver.openOutputStream(item)) {
                    if (out == null) throw new java.io.IOException("No output");
                    out.write(png);
                } catch (Exception e) {
                    resolver.delete(item, null, null);
                    return false;
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(item, values, null, null);
                return true;
            }
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists() && !dir.mkdirs()) return false;
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(png);
            }
            MediaScannerConnection.scanFile(context, new String[] { file.getAbsolutePath() }, new String[] { "image/png" }, null);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean enqueue(Context context, String url, String userAgent, String mimeType, String name, String pageUrl) {
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null || !downloadable(url)) return false;
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
            if (userAgent != null && !userAgent.isEmpty()) request.addRequestHeader("User-Agent", userAgent);
            String referer = originOf(pageUrl);
            if (referer != null) request.addRequestHeader("Referer", referer);
            request.addRequestHeader("Sec-GPC", "1");
            if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);
            request.setTitle(name);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            manager.enqueue(request);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
