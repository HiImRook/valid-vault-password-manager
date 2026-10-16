package com.valid.vault;

import android.content.Context;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

final class BrowserPrivacy {

    private static final int MAX_UNWRAP = 3;
    private static final String LIST_ASSET = "browser/easylist-domains.txt";
    private static final String LIST_EXCEPTION = "@@";
    private static final AtomicBoolean LIST_STARTED = new AtomicBoolean(false);
    private static volatile Set<String> listBlocked = Collections.emptySet();
    private static volatile Set<String> listAllowed = Collections.emptySet();

    private static final Set<String> MULTI_PART_SUFFIXES = new HashSet<>(Arrays.asList(
        "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "com.au", "net.au", "org.au", "edu.au", "gov.au",
        "co.nz", "org.nz", "net.nz", "co.jp", "ne.jp", "or.jp", "ac.jp", "co.kr", "or.kr", "com.br", "net.br", "org.br", "com.mx", "org.mx",
        "co.in", "net.in", "org.in", "firm.in", "co.za", "org.za", "com.ar", "com.tr", "com.cn", "net.cn", "org.cn", "com.tw", "org.tw",
        "com.hk", "org.hk", "com.sg", "org.sg", "com.my", "com.ph", "com.vn", "co.id", "co.th", "co.il", "com.sa", "com.eg", "com.pk",
        "com.ng", "co.ke", "com.co", "com.pe", "com.ve", "com.ua", "co.at", "or.at", "com.pl", "com.es", "com.pt", "com.gr", "com.ru"
    ));

    private static final Set<String> SHARED_HOST_SUFFIXES = new HashSet<>(Arrays.asList(
        "github.io", "gitlab.io", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev", "workers.dev", "web.app", "firebaseapp.com",
        "appspot.com", "blogspot.com", "wordpress.com", "azurewebsites.net", "cloudfront.net", "cloudapp.net", "amazonaws.com", "glitch.me",
        "onrender.com", "fly.dev", "replit.app", "repl.co", "ngrok.io", "ngrok-free.app", "myshopify.com", "wixsite.com", "squarespace.com",
        "substack.com", "tumblr.com", "neocities.org", "carrd.co", "duckdns.org", "translate.goog", "webflow.io", "framer.website",
        "notion.site", "surge.sh", "bitbucket.io", "readthedocs.io", "deno.dev", "railway.app"
    ));

    private static final Set<String> TRACKER_DOMAINS = new HashSet<>(Arrays.asList(
        "google-analytics.com",
        "analytics.google.com",
        "googletagmanager.com",
        "googletagservices.com",
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "connect.facebook.net",
        "pixel.facebook.com",
        "analytics.tiktok.com",
        "bat.bing.com",
        "clarity.ms",
        "scorecardresearch.com",
        "quantserve.com",
        "quantcount.com",
        "hotjar.com",
        "hotjar.io",
        "mouseflow.com",
        "fullstory.com",
        "api.segment.io",
        "cdn.segment.com",
        "api.mixpanel.com",
        "api-js.mixpanel.com",
        "cdn.mxpnl.com",
        "api.amplitude.com",
        "api2.amplitude.com",
        "cdn.amplitude.com",
        "heapanalytics.com",
        "js-agent.newrelic.com",
        "bam.nr-data.net",
        "criteo.com",
        "criteo.net",
        "taboola.com",
        "outbrain.com",
        "adnxs.com",
        "rubiconproject.com",
        "pubmatic.com",
        "openx.net",
        "casalemedia.com",
        "adsrvr.org",
        "amazon-adsystem.com",
        "ads-twitter.com",
        "analytics.twitter.com",
        "px.ads.linkedin.com",
        "snap.licdn.com",
        "sc-static.net",
        "tr.snapchat.com",
        "ct.pinterest.com",
        "sp.analytics.yahoo.com",
        "moatads.com",
        "chartbeat.com",
        "chartbeat.net",
        "track.hubspot.com",
        "js.hs-analytics.net",
        "logx.optimizely.com",
        "crazyegg.com",
        "luckyorange.com",
        "luckyorange.net",
        "smartlook.com",
        "inspectlet.com",
        "mc.yandex.ru",
        "mc.yandex.com"
    ));

    private static final String[][] TRACKER_PATHS = {
        { "facebook.com", "/tr" },
        { "google.com", "/pagead/" },
        { "google.com", "/ads/" }
    };

    private static final String[][] BUNDLED_ALLOW = {};

    private static final Set<String> STRIP_ALWAYS = new HashSet<>(Arrays.asList(
        "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "mc_cid", "mc_eid",
        "igshid", "ttclid", "twclid", "li_fat_id", "yclid", "_hsenc", "_hsmi", "mkt_tok",
        "oly_anon_id", "oly_enc_id", "vero_id", "rb_clickid", "s_cid", "_gl", "ref_src", "ref_url",
        "srsltid", "epik", "_kx", "wickedid"
    ));

    private static final String[] STRIP_PREFIXES = { "utm_" };

    private static final Map<String, Set<String>> STRIP_BY_SITE = new HashMap<>();

    static {
        STRIP_BY_SITE.put("youtube.com", set("si", "feature", "pp"));
        STRIP_BY_SITE.put("youtu.be", set("si", "feature"));
        STRIP_BY_SITE.put("spotify.com", set("si"));
        STRIP_BY_SITE.put("instagram.com", set("igsh", "igshid"));
        STRIP_BY_SITE.put("x.com", set("s", "t"));
        STRIP_BY_SITE.put("twitter.com", set("s", "t"));
        STRIP_BY_SITE.put("tiktok.com", set("_r", "_t", "is_from_webapp", "sender_device", "sender_web_id", "share_app_id", "share_link_id"));
        STRIP_BY_SITE.put("reddit.com", set("share_id", "ref", "ref_source"));
        STRIP_BY_SITE.put("linkedin.com", set("trk", "trackingid", "lipi"));
        STRIP_BY_SITE.put("amazon.com", set("ref_", "pd_rd_r", "pd_rd_w", "pd_rd_wg", "pd_rd_i", "pf_rd_p", "pf_rd_r", "content-id"));
    }

    private BrowserPrivacy() {}

    private static Set<String> set(String... values) {
        return new HashSet<>(Arrays.asList(values));
    }

    static boolean hostIs(String host, String domain) {
        if (host == null || domain == null) return false;
        return host.equals(domain) || host.endsWith("." + domain);
    }

    private static String[] split(String url) {
        if (url == null) return null;
        int schemeEnd = url.indexOf("://");
        if (schemeEnd <= 0) return null;
        int start = schemeEnd + 3;
        int end = url.length();
        for (int i = start; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '/' || c == '?' || c == '#' || c == '\\') { end = i; break; }
        }
        String authority = url.substring(start, end);
        int at = authority.lastIndexOf('@');
        if (at >= 0) authority = authority.substring(at + 1);
        String host;
        if (authority.startsWith("[")) {
            int close = authority.indexOf(']');
            host = close < 0 ? "" : authority.substring(0, close + 1);
        } else {
            int colon = authority.indexOf(':');
            host = colon < 0 ? authority : authority.substring(0, colon);
        }
        if (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        String rest = url.substring(end);
        int hashAt = rest.indexOf('#');
        if (hashAt >= 0) rest = rest.substring(0, hashAt);
        int queryAt = rest.indexOf('?');
        String path = queryAt < 0 ? rest : rest.substring(0, queryAt);
        String query = queryAt < 0 ? null : rest.substring(queryAt + 1);
        return new String[] { host.toLowerCase(Locale.ROOT), path, query };
    }

    static String hostOf(String url) {
        String[] parts = split(url);
        return parts == null ? "" : parts[0];
    }

    private static boolean isWeb(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    private static String param(String query, String name) {
        if (query == null) return null;
        for (String part : query.split("&")) {
            int eq = part.indexOf('=');
            String key = eq < 0 ? part : part.substring(0, eq);
            if (!key.equals(name) || eq < 0) continue;
            try {
                return URLDecoder.decode(part.substring(eq + 1), StandardCharsets.UTF_8.name());
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    static String unwrap(String url) {
        String[] parts = split(url);
        if (parts == null) return null;
        String host = parts[0];
        String path = parts[1];
        String query = parts[2];
        String target = null;
        if ((host.equals("google.com") || host.startsWith("www.google.") || host.startsWith("google.")) && path.equals("/url")) {
            target = param(query, "q");
            if (!isWeb(target)) target = param(query, "url");
        } else if ((host.equals("l.facebook.com") || host.equals("lm.facebook.com") || host.equals("l.messenger.com")) && path.equals("/l.php")) {
            target = param(query, "u");
        } else if (host.equals("l.instagram.com")) {
            target = param(query, "u");
        } else if ((hostIs(host, "youtube.com")) && path.equals("/redirect")) {
            target = param(query, "q");
        } else if (host.equals("steamcommunity.com") && path.startsWith("/linkfilter")) {
            target = param(query, "url");
            if (!isWeb(target)) target = param(query, "u");
        } else if (host.equals("out.reddit.com")) {
            target = param(query, "url");
        }
        return isWeb(target) ? target : null;
    }

    private static boolean stripKey(String key, String host) {
        String lower = key.toLowerCase(Locale.ROOT);
        if (STRIP_ALWAYS.contains(lower)) return true;
        for (String prefix : STRIP_PREFIXES) if (lower.startsWith(prefix)) return true;
        for (Map.Entry<String, Set<String>> entry : STRIP_BY_SITE.entrySet()) {
            if (hostIs(host, entry.getKey()) && entry.getValue().contains(lower)) return true;
        }
        if (host.contains("amazon.") && (lower.startsWith("pd_rd_") || lower.startsWith("pf_rd_") || lower.equals("ref_"))) return true;
        return false;
    }

    static String stripParams(String url) {
        int hashAt = url.indexOf('#');
        String fragment = hashAt < 0 ? "" : url.substring(hashAt);
        String base = hashAt < 0 ? url : url.substring(0, hashAt);
        int queryAt = base.indexOf('?');
        if (queryAt < 0) return url;
        String head = base.substring(0, queryAt);
        String query = base.substring(queryAt + 1);
        String host = hostOf(url);
        StringBuilder kept = new StringBuilder();
        boolean changed = false;
        for (String part : query.split("&", -1)) {
            if (part.isEmpty()) { changed = true; continue; }
            int eq = part.indexOf('=');
            String key = eq < 0 ? part : part.substring(0, eq);
            if (stripKey(key, host)) { changed = true; continue; }
            if (kept.length() > 0) kept.append('&');
            kept.append(part);
        }
        if (!changed) return url;
        return kept.length() == 0 ? head + fragment : head + "?" + kept + fragment;
    }

    static String clean(String url) {
        if (!isWeb(url)) return url;
        String current = url;
        for (int i = 0; i < MAX_UNWRAP; i++) {
            String next = unwrap(current);
            if (next == null) break;
            current = next;
        }
        return stripParams(current);
    }

    static void loadList(Context context) {
        if (!LIST_STARTED.compareAndSet(false, true)) return;
        Context app = context.getApplicationContext();
        Thread loader = new Thread(() -> {
            Set<String> blocked = new HashSet<>();
            Set<String> allowed = new HashSet<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(app.getAssets().open(LIST_ASSET), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String entry = line.trim().toLowerCase(Locale.ROOT);
                    if (entry.isEmpty()) continue;
                    if (entry.startsWith(LIST_EXCEPTION)) allowed.add(entry.substring(LIST_EXCEPTION.length()));
                    else blocked.add(entry);
                }
            } catch (Exception e) {
                LIST_STARTED.set(false);
                return;
            }
            listAllowed = Collections.unmodifiableSet(allowed);
            listBlocked = Collections.unmodifiableSet(blocked);
        });
        loader.setPriority(Thread.MIN_PRIORITY);
        loader.start();
    }

    private static String matchIn(String host, Set<String> domains) {
        if (host == null || host.isEmpty() || domains.isEmpty()) return null;
        String current = host;
        while (true) {
            if (domains.contains(current)) return current;
            int dot = current.indexOf('.');
            if (dot < 0) return null;
            current = current.substring(dot + 1);
        }
    }

    private static boolean ipLiteral(String host) {
        if (host.startsWith("[")) return true;
        for (int i = 0; i < host.length(); i++) {
            char c = host.charAt(i);
            if ((c < '0' || c > '9') && c != '.') return false;
        }
        return true;
    }

    static String siteOf(String host) {
        if (host == null) return "";
        String value = host.toLowerCase(Locale.ROOT);
        if (value.endsWith(".")) value = value.substring(0, value.length() - 1);
        if (value.isEmpty() || ipLiteral(value)) return value;
        String[] labels = value.split("\\.");
        if (labels.length < 2) return value;
        String lastTwo = labels[labels.length - 2] + "." + labels[labels.length - 1];
        if (SHARED_HOST_SUFFIXES.contains(lastTwo) || MULTI_PART_SUFFIXES.contains(lastTwo)) {
            return labels.length >= 3 ? labels[labels.length - 3] + "." + lastTwo : value;
        }
        return lastTwo;
    }

    private static boolean bundledAllowed(String pageHost, String requestHost) {
        for (String[] pair : BUNDLED_ALLOW) {
            if (hostIs(pageHost, pair[0]) && hostIs(requestHost, pair[1])) return true;
        }
        return false;
    }

    static boolean siteAllowed(String pageHost, Set<String> allowedSites) {
        if (pageHost == null || pageHost.isEmpty() || allowedSites == null) return false;
        for (String site : allowedSites) if (hostIs(pageHost, site)) return true;
        return false;
    }

    static boolean shouldBlock(String requestUrl, String pageHost, Set<String> allowedSites) {
        if (!isWeb(requestUrl)) return false;
        String host = hostOf(requestUrl);
        if (host.isEmpty()) return false;
        if (siteAllowed(pageHost, allowedSites)) return false;
        if (bundledAllowed(pageHost, host)) return false;
        String domain = matchIn(host, TRACKER_DOMAINS);
        if (domain != null) return !hostIs(pageHost, domain);
        String[] parts = split(requestUrl);
        String path = parts == null ? "" : parts[1];
        for (String[] rule : TRACKER_PATHS) {
            if (hostIs(host, rule[0]) && path.startsWith(rule[1]) && !hostIs(pageHost, rule[0])) return true;
        }
        String pageSite = siteOf(pageHost);
        if (!pageSite.isEmpty() && pageSite.equals(siteOf(host))) return false;
        if (matchIn(host, listAllowed) != null) return false;
        return matchIn(host, listBlocked) != null;
    }
}
