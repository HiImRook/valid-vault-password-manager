package com.valid.vault;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.service.autofill.Dataset;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillManager;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@RequiresApi(api = Build.VERSION_CODES.O)
@CapacitorPlugin(name = "AutofillBridge")
public class AutofillBridge extends Plugin {

    private AutofillHandoff.Entry saveEntry = null;
    private boolean saveTaken = false;
    private boolean finished = false;

    private static String extra(Intent intent, String name) {
        String value = intent.getStringExtra(name);
        return value == null ? "" : value;
    }

    @PluginMethod
    public synchronized void getRequest(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String mode = extra(intent, ValidAutofillService.EXTRA_MODE);
        JSObject ret = new JSObject();
        ret.put("mode", mode);
        ret.put("domain", extra(intent, ValidAutofillService.EXTRA_DOMAIN));
        ret.put("packageName", extra(intent, ValidAutofillService.EXTRA_PACKAGE));
        ret.put("appLabel", extra(intent, ValidAutofillService.EXTRA_APP_LABEL));
        ret.put("webDomain", extra(intent, ValidAutofillService.EXTRA_WEB_DOMAIN));
        ret.put("isBrowser", intent.getBooleanExtra(ValidAutofillService.EXTRA_IS_BROWSER, false));
        ret.put("appCert", extra(intent, ValidAutofillService.EXTRA_APP_CERT));
        ret.put("hasUsername", intent.getParcelableExtra(ValidAutofillService.EXTRA_USERNAME_ID) != null);
        ret.put("hasPassword", intent.getParcelableExtra(ValidAutofillService.EXTRA_PASSWORD_ID) != null);
        ret.put("browserReply", browserReply(intent));
        if (ValidAutofillService.MODE_SAVE.equals(mode)) {
            if (!saveTaken) {
                if (browserReply(intent)) {
                    String username = intent.getStringExtra(BrowserFill.EXTRA_SAVE_USERNAME);
                    String password = intent.getStringExtra(BrowserFill.EXTRA_SAVE_PASSWORD);
                    saveEntry = password == null || password.isEmpty() ? null : new AutofillHandoff.Entry(username == null ? "" : username, password, 0);
                    intent.removeExtra(BrowserFill.EXTRA_SAVE_USERNAME);
                    intent.removeExtra(BrowserFill.EXTRA_SAVE_PASSWORD);
                } else {
                    saveEntry = AutofillHandoff.take(intent.getStringExtra(ValidAutofillService.EXTRA_TOKEN));
                }
                saveTaken = true;
            }
            ret.put("username", saveEntry == null ? "" : saveEntry.username);
            ret.put("password", saveEntry == null ? "" : saveEntry.password);
            ret.put("expired", saveEntry == null);
        }
        call.resolve(ret);
    }

    private static boolean browserReply(Intent intent) {
        return intent.getBooleanExtra(BrowserFill.EXTRA_REPLY, false);
    }

    private void finishWith(int result, Intent data) {
        if (finished) return;
        finished = true;
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (data != null) activity.setResult(result, data);
            else activity.setResult(result);
            activity.finish();
        });
    }

    @PluginMethod
    public synchronized void complete(PluginCall call) {
        Intent intent = getActivity().getIntent();
        if (browserReply(intent)) {
            String username = call.getString("username");
            String password = call.getString("password");
            if ((username == null || username.isEmpty()) && (password == null || password.isEmpty())) {
                call.reject("Nothing to fill");
                return;
            }
            Intent reply = new Intent();
            reply.putExtra(BrowserFill.EXTRA_RESULT_USERNAME, username == null ? "" : username);
            reply.putExtra(BrowserFill.EXTRA_RESULT_PASSWORD, password == null ? "" : password);
            finishWith(Activity.RESULT_OK, reply);
            call.resolve();
            return;
        }
        AutofillId usernameId = intent.getParcelableExtra(ValidAutofillService.EXTRA_USERNAME_ID);
        AutofillId passwordId = intent.getParcelableExtra(ValidAutofillService.EXTRA_PASSWORD_ID);
        String username = call.getString("username");
        String password = call.getString("password");
        RemoteViews view = ValidAutofillService.presentation(getContext(), ValidAutofillService.BRAND);
        Dataset.Builder dataset = new Dataset.Builder(view);
        boolean any = false;
        if (usernameId != null && username != null && !username.isEmpty()) {
            dataset.setValue(usernameId, AutofillValue.forText(username), view);
            any = true;
        }
        if (passwordId != null && password != null && !password.isEmpty()) {
            dataset.setValue(passwordId, AutofillValue.forText(password), view);
            any = true;
        }
        if (!any) {
            call.reject("Nothing to fill");
            return;
        }
        Intent reply = new Intent();
        reply.putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset.build());
        finishWith(Activity.RESULT_OK, reply);
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        saveEntry = null;
        finishWith(Activity.RESULT_CANCELED, null);
        call.resolve();
    }
}
