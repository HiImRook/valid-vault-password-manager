package com.valid.vault;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "BrowserBridge")
public class BrowserBridge extends Plugin {

    private static final int MAX_URL_LENGTH = 8192;

    private static boolean isWebUrl(String url) {
        if (url == null || url.length() > MAX_URL_LENGTH) return false;
        String lower = url.trim().toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    private JSObject settingsJson(BrowserSettings settings) {
        JSObject ret = new JSObject();
        ret.put("supported", BrowserActivity.supported());
        ret.put("engine", settings.engine);
        JSArray sites = new JSArray();
        for (String site : settings.allowedSites) sites.put(site);
        ret.put("allowedSites", sites);
        if (settings.themeChosen) ret.put("theme", settings.theme);
        return ret;
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (!BrowserActivity.supported()) {
            call.reject("The private browser needs Android 9 or newer");
            return;
        }
        if (!isWebUrl(url)) {
            call.reject("Only web addresses open in the browser");
            return;
        }
        try {
            getActivity().startActivity(BrowserActivity.openIntent(getContext(), url.trim(), false));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the browser");
        }
    }

    @PluginMethod
    public void openSearch(PluginCall call) {
        if (!BrowserActivity.supported()) {
            call.reject("The private browser needs Android 9 or newer");
            return;
        }
        try {
            getActivity().startActivity(BrowserActivity.openIntent(getContext(), null, true));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the browser");
        }
    }

    @PluginMethod
    public void getSettings(PluginCall call) {
        call.resolve(settingsJson(BrowserSettings.load(getContext())));
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "");
        if (!BrowserSettings.THEME_DAY.equals(theme) && !BrowserSettings.THEME_NIGHT.equals(theme)) {
            call.reject("Unknown theme");
            return;
        }
        BrowserSettings saved = BrowserSettings.update(getContext(), settings -> {
            settings.theme = theme;
            settings.themeChosen = true;
        });
        if (saved == null) {
            call.reject("Could not save the theme");
            return;
        }
        call.resolve(settingsJson(saved));
    }

    @PluginMethod
    public void setEngine(PluginCall call) {
        String engine = call.getString("engine");
        if (engine == null || !BrowserSettings.ENGINES.contains(engine)) {
            call.reject("Unknown search engine");
            return;
        }
        BrowserSettings saved = BrowserSettings.update(getContext(), settings -> settings.engine = engine);
        if (saved == null) {
            call.reject("Could not save the search engine");
            return;
        }
        call.resolve(settingsJson(saved));
    }

    @PluginMethod
    public void setGenerator(PluginCall call) {
        Integer min = call.getInt("min");
        Integer max = call.getInt("max");
        if (min == null || max == null || !BrowserSettings.GEN_MIN_CHOICES.contains(min) || !BrowserSettings.GEN_MAX_CHOICES.contains(max)) {
            call.reject("Unknown password length");
            return;
        }
        BrowserSettings current = BrowserSettings.load(getContext());
        if (current.genMin == min && current.genMax == max) {
            call.resolve();
            return;
        }
        BrowserSettings saved = BrowserSettings.update(getContext(), settings -> {
            settings.genMin = min;
            settings.genMax = max;
        });
        if (saved == null) {
            call.reject("Could not save the password length");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void removeAllowedSite(PluginCall call) {
        String site = BrowserSettings.normalizeSite(call.getString("site"));
        if (site.isEmpty()) {
            call.reject("No site given");
            return;
        }
        BrowserSettings saved = BrowserSettings.update(getContext(), settings -> settings.allowedSites.remove(site));
        if (saved == null) {
            call.reject("Could not save the change");
            return;
        }
        call.resolve(settingsJson(saved));
    }
}
