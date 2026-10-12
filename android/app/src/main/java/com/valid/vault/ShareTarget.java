package com.valid.vault;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareTarget")
public class ShareTarget extends Plugin {

    private static final int MAX_TEXT_LENGTH = 4096;
    private static final int MAX_SUBJECT_LENGTH = 512;
    private static final String EVENT_SHARE = "shareReceived";

    private String pendingText = null;
    private String pendingSubject = null;

    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        if (capture(intent)) getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (capture(intent)) notifyListeners(EVENT_SHARE, new JSObject(), true);
    }

    private static String clip(CharSequence value, int max) {
        if (value == null) return "";
        String text = value.toString();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private synchronized boolean capture(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return false;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.length() == 0) return false;
        pendingText = clip(text, MAX_TEXT_LENGTH);
        pendingSubject = clip(intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT), MAX_SUBJECT_LENGTH);
        return true;
    }

    @PluginMethod
    public synchronized void takePending(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("found", pendingText != null);
        ret.put("text", pendingText == null ? "" : pendingText);
        ret.put("subject", pendingSubject == null ? "" : pendingSubject);
        pendingText = null;
        pendingSubject = null;
        call.resolve(ret);
    }

    @PluginMethod
    public void returnToSender(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        call.resolve();
    }
}
