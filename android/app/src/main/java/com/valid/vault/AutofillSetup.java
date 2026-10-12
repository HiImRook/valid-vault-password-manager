package com.valid.vault;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.autofill.AutofillManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AutofillSetup")
public class AutofillSetup extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        boolean supported = false;
        boolean enabled = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AutofillManager manager = getContext().getSystemService(AutofillManager.class);
            if (manager != null) {
                supported = manager.isAutofillSupported();
                enabled = manager.hasEnabledAutofillServices();
            }
        }
        JSObject ret = new JSObject();
        ret.put("supported", supported);
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Autofill needs Android 8 or newer");
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the autofill settings");
        }
    }
}
