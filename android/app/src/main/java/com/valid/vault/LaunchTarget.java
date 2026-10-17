package com.valid.vault;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "LaunchTarget")
public class LaunchTarget extends Plugin {

    static final String EXTRA_TAB = "vv_open_tab";
    static final String TAB_BOOKMARKS = "bookmarks";
    static final String TAB_LOGINS = "logins";
    static final String TAB_WALLETS = "wallets";
    static final String TAB_PERSONAL = "personal";
    static final String TAB_SETTINGS = "settings";
    private static final Set<String> TABS = new HashSet<>(Arrays.asList(TAB_BOOKMARKS, TAB_LOGINS, TAB_WALLETS, TAB_PERSONAL, TAB_SETTINGS));
    private static final String ACTION_PREFIX = "com.valid.vault.OPEN_";
    private static final String EVENT_LAUNCH = "launchTab";

    private String pendingTab = null;

    static Intent tabIntent(Context context, String tab) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(ACTION_PREFIX + tab);
        intent.putExtra(EXTRA_TAB, tab);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    static PendingIntent tabPending(Context context, String tab, int requestCode) {
        return PendingIntent.getActivity(context, requestCode, tabIntent(context, tab), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        if (capture(intent)) getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (capture(intent)) notifyListeners(EVENT_LAUNCH, new JSObject(), true);
    }

    private synchronized boolean capture(Intent intent) {
        if (intent == null) return false;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false;
        String tab = intent.getStringExtra(EXTRA_TAB);
        if (tab == null || !TABS.contains(tab)) return false;
        pendingTab = tab;
        return true;
    }

    @PluginMethod
    public synchronized void takePending(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("found", pendingTab != null);
        ret.put("tab", pendingTab == null ? "" : pendingTab);
        pendingTab = null;
        call.resolve(ret);
    }
}
