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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

    private static final String FILL_PROMPT = "Fill from your vault";
    private static final String LOGIN_PROMPT = "Log in to ";
    private static final int REQUEST_CODE_SPAN = 1 << 30;
    private static final AtomicInteger REQUEST_CODES = new AtomicInteger(new SecureRandom().nextInt(REQUEST_CODE_SPAN));
    private static final Map<String, Set<String>> TRUSTED_BROWSERS = new HashMap<>();

    static {
        trustBrowser("com.android.chrome", "19:75:B2:F1:71:77:BC:89:A5:DF:F3:1F:9E:64:A6:CA:E2:81:A5:3D:C1:D1:D5:9B:1D:14:7F:E1:C8:2A:FA:00", "F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83");
        trustBrowser("com.chrome.beta", "3D:7A:12:23:01:9A:A3:9D:9E:A0:E3:43:6A:B7:C0:89:6B:FB:4F:B6:79:F4:DE:5F:E7:C2:3F:32:6C:8F:99:4A", "DA:63:3D:34:B6:9E:63:AE:21:03:B4:9D:53:CE:05:2F:C5:F7:F3:C5:3A:AB:94:FD:C2:A2:08:BD:FD:14:24:9C");
        trustBrowser("com.chrome.dev", "3D:7A:12:23:01:9A:A3:9D:9E:A0:E3:43:6A:B7:C0:89:6B:FB:4F:B6:79:F4:DE:5F:E7:C2:3F:32:6C:8F:99:4A", "90:44:EE:5F:EE:4B:BC:5E:21:DD:44:66:54:31:C4:EB:1F:1F:71:A3:27:16:A0:BC:92:7B:CB:B3:92:33:CA:BF");
        trustBrowser("com.chrome.canary", "20:19:DF:A1:FB:23:EF:BF:70:C5:BC:D1:44:3C:5B:EA:B0:4F:3F:2F:F4:36:6E:9A:C1:E3:45:76:39:A2:4C:FC");
        trustBrowser("org.chromium.chrome", "19:75:B2:F1:71:77:BC:89:A5:DF:F3:1F:9E:64:A6:CA:E2:81:A5:3D:C1:D1:D5:9B:1D:14:7F:E1:C8:2A:FA:00", "C6:AD:B8:B8:3C:6D:4C:17:D2:92:AF:DE:56:FD:48:8A:51:D3:16:FF:8F:2C:11:C5:41:02:23:BF:F8:A7:DB:B3");
        trustBrowser("org.mozilla.firefox", "A7:8B:62:A5:16:5B:44:94:B2:FE:AD:9E:76:A2:80:D2:2D:93:7F:EE:62:51:AE:CE:59:94:46:B2:EA:31:9B:04");
        trustBrowser("org.mozilla.firefox_beta", "A7:8B:62:A5:16:5B:44:94:B2:FE:AD:9E:76:A2:80:D2:2D:93:7F:EE:62:51:AE:CE:59:94:46:B2:EA:31:9B:04");
        trustBrowser("org.mozilla.fenix", "50:04:77:90:88:E7:F9:88:D5:BC:5C:C5:F8:79:8F:EB:F4:F8:CD:08:4A:1B:2A:46:EF:D4:C8:EE:4A:EA:F2:11");
        trustBrowser("org.mozilla.focus", "62:03:A4:73:BE:36:D6:4E:E3:7F:87:FA:50:0E:DB:C7:9E:AB:93:06:10:AB:9B:9F:A4:CA:7D:5C:1F:1B:4F:FC");
        trustBrowser("com.brave.browser", "9C:2D:B7:05:13:51:5F:DB:FB:BC:58:5B:3E:DF:3D:71:23:D4:DC:67:C9:4F:FD:30:63:61:C1:D7:9B:BF:18:AC");
        trustBrowser("com.brave.browser_beta", "9C:2D:B7:05:13:51:5F:DB:FB:BC:58:5B:3E:DF:3D:71:23:D4:DC:67:C9:4F:FD:30:63:61:C1:D7:9B:BF:18:AC");
        trustBrowser("com.brave.browser_nightly", "9C:2D:B7:05:13:51:5F:DB:FB:BC:58:5B:3E:DF:3D:71:23:D4:DC:67:C9:4F:FD:30:63:61:C1:D7:9B:BF:18:AC");
        trustBrowser("com.microsoft.emmx", "01:E1:99:97:10:A8:2C:27:49:B4:D5:0C:44:5D:C8:5D:67:0B:61:36:08:9D:0A:76:6A:73:82:7C:82:A1:EA:C9");
        trustBrowser("com.sec.android.app.sbrowser", "34:DF:0E:7A:9F:1C:F1:89:2E:45:C0:56:B4:97:3C:D8:1C:CF:14:8A:40:50:D1:1A:EA:4A:C5:A6:5F:90:0A:42", "C8:A2:E9:BC:CF:59:7C:2F:B6:DC:66:BE:E2:93:FC:13:F2:FC:47:EC:77:BC:6B:2B:0D:52:C1:1F:51:19:2A:B8");
        trustBrowser("com.sec.android.app.sbrowser.beta", "34:DF:0E:7A:9F:1C:F1:89:2E:45:C0:56:B4:97:3C:D8:1C:CF:14:8A:40:50:D1:1A:EA:4A:C5:A6:5F:90:0A:42", "C8:A2:E9:BC:CF:59:7C:2F:B6:DC:66:BE:E2:93:FC:13:F2:FC:47:EC:77:BC:6B:2B:0D:52:C1:1F:51:19:2A:B8");
        trustBrowser("com.duckduckgo.mobile.android", "BB:7B:B3:1C:57:3C:46:A1:DA:7F:C5:C5:28:A6:AC:F4:32:10:84:56:FE:EC:50:81:0C:7F:33:69:4E:B3:D2:D4");
        trustBrowser("com.vivaldi.browser", "E8:A7:85:44:65:5B:A8:C0:98:17:F7:32:76:8F:56:89:B1:66:2E:C4:B2:BC:5A:0B:C0:EC:13:8D:33:CA:3D:1E");
        trustBrowser("com.opera.browser", "5D:6A:FB:F8:7F:65:2A:F0:46:47:AD:A0:DF:63:4C:F2:23:70:90:0B:16:4B:09:D5:0B:D2:3A:A2:CB:52:85:B8");
        trustBrowser("com.opera.mini.native", "57:AC:BC:52:5F:1B:2E:BD:19:19:6C:D6:F0:14:39:7C:C9:10:FD:18:84:1E:0A:E8:50:FE:BC:3E:1E:59:3F:F2");
    }

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
        boolean browser = false;
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
            return browser;
        }

        String trustedDomain() {
            return isBrowser() ? webDomain : "";
        }
    }

    private static void trustBrowser(String packageName, String... fingerprints) {
        Set<String> pins = new HashSet<>();
        for (String fingerprint : fingerprints) pins.add(fingerprint.replace(":", "").toLowerCase(Locale.ROOT));
        TRUSTED_BROWSERS.put(packageName, pins);
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

    static RemoteViews presentation(Context context, String title, String subtitle) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.vv_autofill_item);
        views.setTextViewText(R.id.vv_autofill_title, title);
        if (subtitle == null || subtitle.isEmpty()) {
            views.setViewVisibility(R.id.vv_autofill_sub, View.GONE);
        } else {
            views.setTextViewText(R.id.vv_autofill_sub, subtitle);
            views.setViewVisibility(R.id.vv_autofill_sub, View.VISIBLE);
        }
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

    private boolean trustedBrowser(String packageName) {
        Set<String> pins = TRUSTED_BROWSERS.get(packageName);
        if (pins == null) return false;
        String certificate = appCertificate(packageName);
        if (certificate.isEmpty()) return false;
        for (String digest : certificate.split(":")) if (pins.contains(digest)) return true;
        return false;
    }

    private Form readForm(AssistStructure structure) {
        Form form = parse(structure);
        form.browser = trustedBrowser(form.packageName);
        return form;
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
            Form form = readForm(contexts.get(contexts.size() - 1).getStructure());
            if (form.packageName.isEmpty() || form.packageName.equals(getPackageName())) { callback.onSuccess(null); return; }
            Field password = form.password(false);
            Field username = form.username(password != null ? password : form.password(true));
            if (password == null && username == null) { callback.onSuccess(null); return; }

            Intent intent = baseIntent(MODE_FILL, form);
            intent.putExtra(EXTRA_USERNAME_ID, username != null ? username.id : null);
            intent.putExtra(EXTRA_PASSWORD_ID, password != null ? password.id : null);
            IntentSender sender = PendingIntent.getActivity(this, REQUEST_CODES.getAndIncrement(), intent, pendingFlags()).getIntentSender();

            String domain = form.trustedDomain();
            String label = appLabel(form.packageName);
            String target = !domain.isEmpty() ? domain : (label.equals(form.packageName) ? "" : label);
            RemoteViews view = presentation(this, BRAND, target.isEmpty() ? FILL_PROMPT : LOGIN_PROMPT + target);
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
                Form candidate = readForm(contexts.get(i).getStructure());
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
