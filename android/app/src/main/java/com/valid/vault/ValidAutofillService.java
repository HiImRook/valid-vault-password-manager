package com.valid.vault;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveInfo;
import android.service.autofill.SaveRequest;
import android.text.InputType;
import android.util.Pair;
import android.view.View;
import android.view.ViewStructure;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import androidx.annotation.RequiresApi;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

@RequiresApi(api = Build.VERSION_CODES.O)
public class ValidAutofillService extends AutofillService {

    static final String EXTRA_MODE = "vv_mode";
    static final String EXTRA_DOMAIN = "vv_domain";
    static final String EXTRA_PACKAGE = "vv_package";
    static final String EXTRA_APP_LABEL = "vv_app_label";
    static final String EXTRA_WEB_DOMAIN = "vv_web_domain";
    static final String EXTRA_IS_BROWSER = "vv_is_browser";
    static final String EXTRA_APP_CERT = "vv_app_cert";
    static final String EXTRA_USERNAME_ID = "vv_username_id";
    static final String EXTRA_PASSWORD_ID = "vv_password_id";
    static final String EXTRA_TOKEN = "vv_token";
    static final String MODE_FILL = "fill";
    static final String MODE_SAVE = "save";
    static final String BRAND = "Valid Vault";

    private static final String SEPARATOR = " · ";
    private static final int REQUEST_CODE_SPAN = 1 << 30;
    private static final AtomicInteger REQUEST_CODES = new AtomicInteger(new SecureRandom().nextInt(REQUEST_CODE_SPAN));
    private static final Set<String> TRUSTED_BROWSERS = new HashSet<>(Arrays.asList(
        "com.android.chrome",
        "com.chrome.beta",
        "com.chrome.dev",
        "com.chrome.canary",
        "org.chromium.chrome",
        "org.mozilla.firefox",
        "org.mozilla.firefox_beta",
        "org.mozilla.fenix",
        "org.mozilla.focus",
        "com.brave.browser",
        "com.brave.browser_beta",
        "com.brave.browser_nightly",
        "com.microsoft.emmx",
        "com.sec.android.app.sbrowser",
        "com.sec.android.app.sbrowser.beta",
        "com.duckduckgo.mobile.android",
        "com.vivaldi.browser",
        "com.opera.browser",
        "com.opera.mini.native",
        "com.kiwibrowser.browser"
    ));
    private static final String[] PASSWORD_WORDS = { "password", "passwd", "passcode", "pwd" };
    private static final String[] USERNAME_WORDS = { "username", "user", "email", "e-mail", "login", "account", "phone", "mobile", "identifier" };

    static final class Field {
        final AutofillId id;
        final int order;
        final boolean newPassword;
        final AutofillValue value;

        Field(AutofillId id, int order, boolean newPassword, AutofillValue value) {
            this.id = id;
            this.order = order;
            this.newPassword = newPassword;
            this.value = value;
        }
    }

    static final class Form {
        String packageName = "";
        String webDomain = "";
        final List<Field> usernames = new ArrayList<>();
        final List<Field> passwords = new ArrayList<>();
        int order = 0;

        Field password(boolean allowNew) {
            for (Field f : passwords) if (!f.newPassword) return f;
            if (allowNew && !passwords.isEmpty()) return passwords.get(0);
            return null;
        }

        Field username(Field password) {
            if (usernames.isEmpty()) return null;
            if (password == null) return usernames.get(0);
            Field best = null;
            for (Field f : usernames) if (f.order < password.order) best = f;
            return best != null ? best : usernames.get(0);
        }

        boolean isBrowser() {
            return TRUSTED_BROWSERS.contains(packageName);
        }

        String trustedDomain() {
            return isBrowser() ? webDomain : "";
        }
    }

    private static boolean containsAny(String text, String[] words) {
        if (text == null) return false;
        String lower = text.toLowerCase(Locale.ROOT);
        for (String word : words) if (lower.contains(word)) return true;
        return false;
    }

    private static String htmlAttribute(ViewStructure.HtmlInfo info, String name) {
        if (info == null || info.getAttributes() == null) return null;
        for (Pair<String, String> pair : info.getAttributes()) {
            if (pair != null && name.equalsIgnoreCase(pair.first)) return pair.second == null ? null : pair.second.toLowerCase(Locale.ROOT);
        }
        return null;
    }

    private static boolean hintIs(String[] hints, String... wanted) {
        if (hints == null) return false;
        for (String hint : hints) {
            if (hint == null) continue;
            for (String w : wanted) if (w.equalsIgnoreCase(hint)) return true;
        }
        return false;
    }

    private static void classify(AssistStructure.ViewNode node, Form form) {
        AutofillId id = node.getAutofillId();
        if (id == null || node.getAutofillType() != View.AUTOFILL_TYPE_TEXT) return;
        if (node.getVisibility() != View.VISIBLE || !node.isEnabled()) return;
        String[] hints = node.getAutofillHints();
        ViewStructure.HtmlInfo html = node.getHtmlInfo();
        String htmlType = htmlAttribute(html, "type");
        String autocomplete = htmlAttribute(html, "autocomplete");
        int inputType = node.getInputType();
        int inputClass = inputType & InputType.TYPE_MASK_CLASS;
        int variation = inputType & InputType.TYPE_MASK_VARIATION;
        String idEntry = node.getIdEntry();
        CharSequence hintText = node.getHint();
        String hint = hintText == null ? null : hintText.toString();
        String htmlName = htmlAttribute(html, "name");
        String htmlId = htmlAttribute(html, "id");

        boolean isNew = autocomplete != null && autocomplete.contains("new-password");
        boolean password = hintIs(hints, View.AUTOFILL_HINT_PASSWORD, "current-password", "new-password", "password")
            || "password".equals(htmlType)
            || (autocomplete != null && autocomplete.contains("password"))
            || (inputClass == InputType.TYPE_CLASS_TEXT && (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD))
            || (inputClass == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD)
            || containsAny(idEntry, PASSWORD_WORDS) || containsAny(hint, PASSWORD_WORDS)
            || containsAny(htmlName, PASSWORD_WORDS) || containsAny(htmlId, PASSWORD_WORDS);
        if (hintIs(hints, "new-password")) isNew = true;

        int order = form.order++;
        if (password) {
            form.passwords.add(new Field(id, order, isNew, node.getAutofillValue()));
            return;
        }
        boolean username = hintIs(hints, View.AUTOFILL_HINT_USERNAME, View.AUTOFILL_HINT_EMAIL_ADDRESS, View.AUTOFILL_HINT_PHONE, "email", "username")
            || "email".equals(htmlType)
            || (autocomplete != null && (autocomplete.contains("username") || autocomplete.contains("email")))
            || (inputClass == InputType.TYPE_CLASS_TEXT && (variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                || variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS))
            || containsAny(idEntry, USERNAME_WORDS) || containsAny(hint, USERNAME_WORDS)
            || containsAny(htmlName, USERNAME_WORDS) || containsAny(htmlId, USERNAME_WORDS);
        if (username) form.usernames.add(new Field(id, order, false, node.getAutofillValue()));
    }

    private static void walk(AssistStructure.ViewNode node, Form form) {
        if (node == null) return;
        if (form.webDomain.isEmpty() && node.getWebDomain() != null) form.webDomain = node.getWebDomain().toLowerCase(Locale.ROOT);
        classify(node, form);
        for (int i = 0; i < node.getChildCount(); i++) walk(node.getChildAt(i), form);
    }

    static Form parse(AssistStructure structure) {
        Form form = new Form();
        if (structure.getActivityComponent() != null) form.packageName = structure.getActivityComponent().getPackageName();
        for (int i = 0; i < structure.getWindowNodeCount(); i++) walk(structure.getWindowNodeAt(i).getRootViewNode(), form);
        return form;
    }

    static RemoteViews presentation(Context context, String text) {
        RemoteViews views = new RemoteViews(context.getPackageName(), android.R.layout.simple_list_item_1);
        views.setTextViewText(android.R.id.text1, text);
        return views;
    }

    private String appLabel(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            CharSequence label = pm.getApplicationLabel(info);
            return label == null ? packageName : label.toString();
        } catch (Exception e) {
            return packageName;
        }
    }

    private String appCertificate(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            Signature[] signatures;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo signing = info.signingInfo;
                signatures = signing == null ? null : signing.getApkContentsSigners();
            } else {
                signatures = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures;
            }
            if (signatures == null || signatures.length == 0) return "";
            List<String> digests = new ArrayList<>();
            for (Signature signature : signatures) {
                byte[] hash = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray());
                StringBuilder hex = new StringBuilder();
                for (byte b : hash) hex.append(String.format("%02x", b));
                digests.add(hex.toString());
            }
            java.util.Collections.sort(digests);
            return String.join(":", digests);
        } catch (Exception e) {
            return "";
        }
    }

    private int pendingFlags() {
        return PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private Intent baseIntent(String mode, Form form) {
        Intent intent = new Intent(this, AutofillActivity.class);
        intent.putExtra(EXTRA_MODE, mode);
        intent.putExtra(EXTRA_DOMAIN, form.trustedDomain());
        intent.putExtra(EXTRA_WEB_DOMAIN, form.webDomain);
        intent.putExtra(EXTRA_IS_BROWSER, form.isBrowser());
        intent.putExtra(EXTRA_PACKAGE, form.packageName);
        intent.putExtra(EXTRA_APP_LABEL, appLabel(form.packageName));
        intent.putExtra(EXTRA_APP_CERT, form.isBrowser() ? "" : appCertificate(form.packageName));
        intent.putExtra(EXTRA_TOKEN, "");
        return intent;
    }

    @Override
    public void onFillRequest(FillRequest request, CancellationSignal cancellationSignal, FillCallback callback) {
        try {
            List<FillContext> contexts = request.getFillContexts();
            if (contexts == null || contexts.isEmpty()) { callback.onSuccess(null); return; }
            Form form = parse(contexts.get(contexts.size() - 1).getStructure());
            if (form.packageName.isEmpty() || form.packageName.equals(getPackageName())) { callback.onSuccess(null); return; }
            Field password = form.password(false);
            Field username = form.username(password != null ? password : form.password(true));
            if (password == null && username == null) { callback.onSuccess(null); return; }

            Intent intent = baseIntent(MODE_FILL, form);
            intent.putExtra(EXTRA_USERNAME_ID, username != null ? username.id : null);
            intent.putExtra(EXTRA_PASSWORD_ID, password != null ? password.id : null);
            IntentSender sender = PendingIntent.getActivity(this, REQUEST_CODES.getAndIncrement(), intent, pendingFlags()).getIntentSender();

            String domain = form.trustedDomain();
            RemoteViews view = presentation(this, domain.isEmpty() ? BRAND : BRAND + SEPARATOR + domain);
            Dataset.Builder dataset = new Dataset.Builder(view);
            if (username != null) dataset.setValue(username.id, null, view);
            if (password != null) dataset.setValue(password.id, null, view);
            dataset.setAuthentication(sender);

            FillResponse.Builder response = new FillResponse.Builder().addDataset(dataset.build());
            Field savePassword = form.password(true);
            if (savePassword != null) {
                Field saveUsername = form.username(savePassword);
                int types = SaveInfo.SAVE_DATA_TYPE_PASSWORD | (saveUsername != null ? SaveInfo.SAVE_DATA_TYPE_USERNAME : 0);
                SaveInfo.Builder save = new SaveInfo.Builder(types, new AutofillId[] { savePassword.id });
                if (saveUsername != null) save.setOptionalIds(new AutofillId[] { saveUsername.id });
                save.setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE);
                response.setSaveInfo(save.build());
            }
            callback.onSuccess(response.build());
        } catch (Exception e) {
            callback.onSuccess(null);
        }
    }

    private static String textOf(Field field) {
        if (field == null || field.value == null || !field.value.isText()) return "";
        CharSequence text = field.value.getTextValue();
        return text == null ? "" : text.toString();
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        try {
            List<FillContext> contexts = request.getFillContexts();
            if (contexts == null || contexts.isEmpty()) { callback.onSuccess(); return; }
            Form form = null;
            String password = "";
            String username = "";
            for (int i = contexts.size() - 1; i >= 0; i--) {
                Form candidate = parse(contexts.get(i).getStructure());
                if (form == null) form = candidate;
                Field passwordField = candidate.password(true);
                if (password.isEmpty()) {
                    password = textOf(passwordField);
                    if (!password.isEmpty()) form = candidate;
                }
                if (username.isEmpty()) username = textOf(candidate.username(passwordField));
                if (!password.isEmpty() && !username.isEmpty()) break;
            }
            if (form == null || form.packageName.isEmpty() || form.packageName.equals(getPackageName())) { callback.onSuccess(); return; }
            if (password.isEmpty()) { callback.onSuccess(); return; }

            Intent intent = baseIntent(MODE_SAVE, form);
            intent.putExtra(EXTRA_TOKEN, AutofillHandoff.put(username, password));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                IntentSender sender = PendingIntent.getActivity(this, REQUEST_CODES.getAndIncrement(), intent, pendingFlags()).getIntentSender();
                callback.onSuccess(sender);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                callback.onSuccess();
            }
        } catch (Exception e) {
            callback.onFailure("Valid Vault could not open the save screen");
        }
    }
}
