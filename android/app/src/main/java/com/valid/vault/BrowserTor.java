package com.valid.vault;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.webkit.ProxyConfig;
import androidx.webkit.WebViewFeature;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

final class BrowserTor {

    static final String ORBOT_PACKAGE = "org.torproject.android";
    private static final String SOCKS_HOST = "127.0.0.1";
    private static final int SOCKS_PORT = 9050;
    private static final String PROXY_RULE = "socks5://" + SOCKS_HOST + ":" + SOCKS_PORT;
    private static final int CHECK_TIMEOUT_MS = 2500;
    private static final byte SOCKS_VERSION = 5;
    private static final byte SOCKS_NO_AUTH = 0;
    private static final String STORE_URL = "market://details?id=" + ORBOT_PACKAGE;
    private static final String STORE_WEB_URL = "https://play.google.com/store/apps/details?id=" + ORBOT_PACKAGE;

    private BrowserTor() {}

    static boolean supported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)
            && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
    }

    static ProxyConfig config() {
        return new ProxyConfig.Builder()
            .addProxyRule(PROXY_RULE)
            .removeImplicitRules()
            .build();
    }

    static boolean socksReady() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(SOCKS_HOST, SOCKS_PORT), CHECK_TIMEOUT_MS);
            socket.setSoTimeout(CHECK_TIMEOUT_MS);
            OutputStream out = socket.getOutputStream();
            out.write(new byte[] { SOCKS_VERSION, 1, SOCKS_NO_AUTH });
            out.flush();
            InputStream in = socket.getInputStream();
            int version = in.read();
            int method = in.read();
            return version == SOCKS_VERSION && method == SOCKS_NO_AUTH;
        } catch (Exception e) {
            return false;
        }
    }

    static Intent launchIntent(Context context) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(ORBOT_PACKAGE);
        if (intent != null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    static Intent storeIntent(boolean web) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(web ? STORE_WEB_URL : STORE_URL));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }
}
