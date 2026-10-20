package com.valid.vault;

import android.app.Activity;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "QrScreen")
public class QrScreen extends Plugin {

    private static final float FULL_BRIGHTNESS = 1f;

    private boolean held = false;

    private void apply(boolean hold) {
        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (window == null) return;
            WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = hold ? FULL_BRIGHTNESS : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            window.setAttributes(params);
            if (hold) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @PluginMethod
    public void hold(PluginCall call) {
        held = true;
        apply(true);
        call.resolve();
    }

    @PluginMethod
    public void release(PluginCall call) {
        held = false;
        apply(false);
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        apply(false);
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (held) apply(true);
    }
}
