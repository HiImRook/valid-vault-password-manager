package com.valid.vault;

import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

final class BrowserFill {

    static final String EXTRA_REPLY = "vv_browser_reply";
    static final String EXTRA_SAVE_USERNAME = "vv_browser_save_username";
    static final String EXTRA_SAVE_PASSWORD = "vv_browser_save_password";
    static final String EXTRA_RESULT_USERNAME = "vv_browser_result_username";
    static final String EXTRA_RESULT_PASSWORD = "vv_browser_result_password";
    static final String EXTRA_RESULT_INFO = "vv_browser_result_info";
    static final String EXTRA_EMAIL_FIELD = "vv_browser_email_field";
    static final String EXTRA_INFO_FIELD = "vv_browser_info_field";
    static final String EXTRA_INFO_FIELDS = "vv_browser_info_fields";
    static final String MODE_INFO = "info";
    static final String BRIDGE_NAME = "vvAutofill";
    static final String TYPE_FILL = "fill";
    static final String TYPE_SAVE = "save";
    static final String TYPE_INFO = "info";
    static final String TYPE_GENERATE = "generate";
    static final String TYPE_GENERATED = "generated";
    static final String TYPE_FILLED = "filled";
    static final String FIELD_EMAIL = "email";
    static final String STYLE_FULL = "full";
    static final String STYLE_PLAIN = "plain";
    static final List<String> INFO_TYPES = Collections.unmodifiableList(Arrays.asList(
        "firstName", "lastName", "email", "phone", "address.street", "address.city", "address.state", "address.zip", "address.country"));
    static final int MAX_MESSAGE_LENGTH = 8192;
    static final int MAX_INFO_RESULT = 32768;
    static final int MAX_FIELD_LENGTH = 1024;
    static final int FILLED_NONE = 0;
    static final int FILL_ERROR = -1;
    static final int FILL_WRONG_PAGE = -2;
    private static final char LINE_SEPARATOR = (char) 0x2028;
    private static final char PARAGRAPH_SEPARATOR = (char) 0x2029;

    private static final String FILL_SCRIPT =
        "(function(o,u,p){if(location.origin!==o)return -2;try{"
        + "var TEXT={'':1,text:1,email:1,tel:1};"
        + "function type(i){return (i.getAttribute('type')||'').toLowerCase()}"
        + "function shown(i){if(!i.isConnected||i.disabled||i.readOnly)return false;var r=i.getBoundingClientRect();if(r.width<4||r.height<4)return false;var s=getComputedStyle(i);return s.visibility!=='hidden'&&s.display!=='none'}"
        + "function set(i,v){var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');i.focus();d.set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}"
        + "function list(s){return Array.prototype.filter.call(s.querySelectorAll('input'),shown)}"
        + "var all=list(document);"
        + "var pws=all.filter(function(i){return type(i)==='password'});"
        + "var a=document.activeElement;"
        + "var pw=(a&&a.tagName==='INPUT'&&type(a)==='password'&&shown(a))?a:(pws[0]||null);"
        + "var user=null;"
        + "if(pw){var scope=list(pw.form||document);var at=scope.indexOf(pw);for(var k=at-1;k>=0;k--){if(TEXT[type(scope[k])]){user=scope[k];break}}}"
        + "else if(a&&a.tagName==='INPUT'&&TEXT[type(a)]&&shown(a)){user=a}"
        + "else{user=all.filter(function(i){return TEXT[type(i)]&&/username|email/.test((i.getAttribute('autocomplete')||'').toLowerCase())})[0]"
        + "||all.filter(function(i){return type(i)==='email'})[0]"
        + "||all.filter(function(i){return TEXT[type(i)]&&/user|login|email|identifier|account/i.test((i.name||'')+' '+(i.id||''))})[0]||null}"
        + "var filled=0;"
        + "if(user&&u){set(user,u);filled+=1}"
        + "if(pw&&p){set(pw,p);filled+=2}"
        + "if(pw)pw.focus();"
        + "return filled}catch(e){return -1}})(";

    private static final String FILL_TAIL = ")";

    private BrowserFill() {}

    static String fillScript(String origin, String username, String password) {
        return FILL_SCRIPT + literal(origin) + "," + literal(username) + "," + literal(password) + FILL_TAIL;
    }

    private static String literal(String value) {
        String quoted = JSONObject.quote(value == null ? "" : value);
        return quoted.replace(String.valueOf(LINE_SEPARATOR), "\\u2028").replace(String.valueOf(PARAGRAPH_SEPARATOR), "\\u2029");
    }

    static String originOf(String url) {
        if (url == null) return null;
        int schemeEnd = url.indexOf("://");
        if (schemeEnd <= 0) return null;
        String scheme = url.substring(0, schemeEnd).toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !scheme.equals("http")) return null;
        int start = schemeEnd + 3;
        int end = url.length();
        for (int i = start; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '/' || c == '?' || c == '#' || c == '\\') {
                end = i;
                break;
            }
        }
        String authority = url.substring(start, end);
        int at = authority.lastIndexOf('@');
        if (at >= 0) authority = authority.substring(at + 1);
        String host;
        String port = "";
        if (authority.startsWith("[")) {
            int close = authority.indexOf(']');
            if (close < 0) return null;
            host = authority.substring(0, close + 1);
            String rest = authority.substring(close + 1);
            if (rest.startsWith(":")) port = rest.substring(1);
            else if (!rest.isEmpty()) return null;
        } else {
            int colon = authority.indexOf(':');
            host = colon < 0 ? authority : authority.substring(0, colon);
            if (colon >= 0) port = authority.substring(colon + 1);
        }
        host = host.toLowerCase(Locale.ROOT);
        if (host.isEmpty()) return null;
        if (!port.isEmpty()) {
            int number;
            try {
                number = Integer.parseInt(port);
            } catch (NumberFormatException e) {
                return null;
            }
            if (number <= 0 || number > 65535) return null;
            boolean standard = (scheme.equals("https") && number == 443) || (scheme.equals("http") && number == 80);
            port = standard ? "" : ":" + number;
        }
        return scheme + "://" + host + port;
    }

    static String fingerprint(String username, String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String user = username == null ? "" : username;
            String pass = password == null ? "" : password;
            byte[] hash = digest.digest((user.length() + ":" + user + pass).getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : hash) out.append(String.format(Locale.ROOT, "%02x", b));
            return out.toString();
        } catch (Exception e) {
            return "";
        }
    }

    static String loginKey(String host, String username, String password) {
        return (host == null ? "" : host.toLowerCase(Locale.ROOT)) + "|" + fingerprint(username, password);
    }

    static int fillResult(String value) {
        if (value == null) return FILL_ERROR;
        try {
            return Integer.parseInt(value.trim());
        } catch (Exception e) {
            return FILL_ERROR;
        }
    }

    static final class Save {
        final String username;
        final String password;

        Save(String username, String password) {
            this.username = username;
            this.password = password;
        }
    }

    static final class Message {
        final String type;
        final String field;
        final List<String> fields;
        final Save save;
        final int number;
        final boolean both;

        Message(String type, String field, List<String> fields, Save save, int number, boolean both) {
            this.type = type;
            this.field = field;
            this.fields = fields;
            this.save = save;
            this.number = number;
            this.both = both;
        }
    }

    static Message parseMessage(String message) {
        if (message == null || message.length() > MAX_MESSAGE_LENGTH) return null;
        try {
            JSONObject json = new JSONObject(message);
            String type = json.optString("type", "");
            if (TYPE_SAVE.equals(type)) {
                Save save = parseSave(message);
                return save == null ? null : new Message(type, "", Collections.emptyList(), save, 0, false);
            }
            if (TYPE_FILL.equals(type)) {
                return new Message(type, FIELD_EMAIL.equals(json.optString("field", "")) ? FIELD_EMAIL : "", Collections.emptyList(), null, 0, false);
            }
            if (TYPE_INFO.equals(type)) {
                String field = json.optString("field", "");
                if (!INFO_TYPES.contains(field)) return null;
                List<String> fields = new ArrayList<>();
                fields.add(field);
                JSONArray list = json.optJSONArray("fields");
                if (list != null) {
                    for (int i = 0; i < list.length() && i < INFO_TYPES.size() * 2; i++) {
                        String t = list.optString(i, "");
                        if (INFO_TYPES.contains(t) && !fields.contains(t)) fields.add(t);
                    }
                }
                return new Message(type, field, Collections.unmodifiableList(fields), null, 0, false);
            }
            if (TYPE_GENERATE.equals(type)) return new Message(type, "", Collections.emptyList(), null, 0, false);
            if (TYPE_GENERATED.equals(type)) {
                int length = json.optInt("length", 0);
                if (length <= 0 || length > MAX_FIELD_LENGTH) return null;
                return new Message(type, "", Collections.emptyList(), null, length, json.optBoolean("both", false));
            }
            if (TYPE_FILLED.equals(type)) {
                int count = json.optInt("count", -1);
                if (count < 0 || count > INFO_TYPES.size() * 4) return null;
                return new Message(type, "", Collections.emptyList(), null, count, false);
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    static String infoCommand(String result, List<String> requested) {
        if (result == null || result.length() > MAX_INFO_RESULT || requested == null) return null;
        try {
            JSONObject given = new JSONObject(result);
            JSONObject values = new JSONObject();
            Iterator<String> keys = given.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!requested.contains(key)) continue;
                Object value = given.opt(key);
                if (!(value instanceof String)) continue;
                String text = (String) value;
                if (text.isEmpty() || text.length() > MAX_FIELD_LENGTH) continue;
                values.put(key, text);
            }
            if (values.length() == 0) return null;
            JSONObject command = new JSONObject();
            command.put("cmd", TYPE_INFO);
            command.put("values", values);
            return command.toString();
        } catch (Exception e) {
            return null;
        }
    }

    static String generateCommand(String style, int min, int max) {
        try {
            JSONObject command = new JSONObject();
            command.put("cmd", TYPE_GENERATE);
            command.put("style", STYLE_PLAIN.equals(style) ? STYLE_PLAIN : STYLE_FULL);
            command.put("min", min);
            command.put("max", max);
            return command.toString();
        } catch (Exception e) {
            return null;
        }
    }

    static Save parseSave(String message) {
        if (message == null || message.length() > MAX_FIELD_LENGTH * 4) return null;
        try {
            JSONObject json = new JSONObject(message);
            if (!TYPE_SAVE.equals(json.optString("type", ""))) return null;
            String username = json.optString("username", "").trim();
            String password = json.optString("password", "");
            if (password.isEmpty() || password.length() > MAX_FIELD_LENGTH || username.length() > MAX_FIELD_LENGTH) return null;
            return new Save(username, password);
        } catch (Exception e) {
            return null;
        }
    }

    static String domainOf(String url) {
        return trimDot(BrowserPrivacy.hostOf(url).toLowerCase(Locale.ROOT));
    }

    static boolean sameHost(String a, String b) {
        if (a == null || b == null) return false;
        String left = trimDot(a.toLowerCase(Locale.ROOT));
        String right = trimDot(b.toLowerCase(Locale.ROOT));
        return !left.isEmpty() && left.equals(right);
    }

    private static String trimDot(String host) {
        return host.endsWith(".") ? host.substring(0, host.length() - 1) : host;
    }

    static boolean secure(String url) {
        return url != null && url.toLowerCase(Locale.ROOT).startsWith("https://");
    }

    static Intent fillIntent(Context context, String domain, boolean emailField) {
        Intent intent = new Intent(context, AutofillActivity.class);
        intent.putExtra(ValidAutofillService.EXTRA_MODE, ValidAutofillService.MODE_FILL);
        intent.putExtra(ValidAutofillService.EXTRA_DOMAIN, domain);
        intent.putExtra(ValidAutofillService.EXTRA_IS_BROWSER, true);
        intent.putExtra(EXTRA_REPLY, true);
        intent.putExtra(EXTRA_EMAIL_FIELD, emailField);
        return intent;
    }

    static Intent infoIntent(Context context, String domain, String field, List<String> fields) {
        Intent intent = new Intent(context, AutofillActivity.class);
        intent.putExtra(ValidAutofillService.EXTRA_MODE, MODE_INFO);
        intent.putExtra(ValidAutofillService.EXTRA_DOMAIN, domain);
        intent.putExtra(ValidAutofillService.EXTRA_IS_BROWSER, true);
        intent.putExtra(EXTRA_REPLY, true);
        intent.putExtra(EXTRA_INFO_FIELD, field);
        intent.putExtra(EXTRA_INFO_FIELDS, new ArrayList<>(fields));
        return intent;
    }

    static Intent saveIntent(Context context, String domain, Save save) {
        Intent intent = new Intent(context, AutofillActivity.class);
        intent.putExtra(ValidAutofillService.EXTRA_MODE, ValidAutofillService.MODE_SAVE);
        intent.putExtra(ValidAutofillService.EXTRA_DOMAIN, domain);
        intent.putExtra(ValidAutofillService.EXTRA_IS_BROWSER, true);
        intent.putExtra(EXTRA_REPLY, true);
        intent.putExtra(EXTRA_SAVE_USERNAME, save.username);
        intent.putExtra(EXTRA_SAVE_PASSWORD, save.password);
        return intent;
    }
}
