package com.valid.vault;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Collections;
import java.util.Set;

import org.json.JSONArray;

final class BrowserScripts {

    static final Set<String> ALL_ORIGINS = Collections.singleton("*");

    static final String PAUSE_MEDIA =
        "(function(){try{document.querySelectorAll('video,audio').forEach(function(m){if(!m.paused)m.pause()})}catch(e){}})();";

    static final String GPC =
        "(function(){try{Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{get:function(){return true},configurable:true,enumerable:true})}catch(e){}})();";

    static final String NO_WEBRTC =
        "(function(){"
        + "var NAMES=['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','RTCRtpSender','RTCRtpReceiver','RTCRtpTransceiver',"
        + "'RTCRtpScriptTransform','RTCIceCandidate','RTCIceTransport','RTCDtlsTransport','RTCSctpTransport','RTCSessionDescription',"
        + "'RTCCertificate','RTCDTMFSender','RTCEncodedAudioFrame','RTCEncodedVideoFrame','RTCError','RTCErrorEvent','RTCStatsReport',"
        + "'RTCTrackEvent','RTCPeerConnectionIceEvent','RTCPeerConnectionIceErrorEvent','RTCDataChannelEvent','RTCDTMFToneChangeEvent'];"
        + "function scrub(w){for(var i=0;i<NAMES.length;i++){try{delete w[NAMES[i]]}catch(e){}"
        + "try{Object.defineProperty(w,NAMES[i],{value:undefined,writable:false,configurable:false,enumerable:false})}catch(e){}}}"
        + "function guard(proto,prop,pick){try{var d=Object.getOwnPropertyDescriptor(proto,prop);if(!d||!d.get)return;var g=d.get;"
        + "Object.defineProperty(proto,prop,{get:function(){var v=g.call(this);try{var w=pick(v);if(w)scrub(w)}catch(e){}return v},"
        + "configurable:false,enumerable:d.enumerable})}catch(e){}}"
        + "function self(v){return v}function view(v){return v&&v.defaultView}"
        + "scrub(window);"
        + "if(window.HTMLIFrameElement){guard(HTMLIFrameElement.prototype,'contentWindow',self);guard(HTMLIFrameElement.prototype,'contentDocument',view)}"
        + "if(window.HTMLFrameElement){guard(HTMLFrameElement.prototype,'contentWindow',self);guard(HTMLFrameElement.prototype,'contentDocument',view)}"
        + "if(window.HTMLObjectElement){guard(HTMLObjectElement.prototype,'contentWindow',self);guard(HTMLObjectElement.prototype,'contentDocument',view)}"
        + "})();";

    private static final String COLLAPSE_HEAD =
        "(function(u){try{var s=new Set(u);"
        + "var SEL='ins.adsbygoogle,[id^=\"div-gpt-ad\"],[id^=\"google_ads_iframe\"],[data-google-query-id],ins[data-ad-slot]';"
        + "var hide=function(e){if(e&&e.style&&e!==document.body&&e!==document.documentElement)e.style.setProperty('display','none','important')};"
        + "document.querySelectorAll(SEL).forEach(hide);"
        + "if(s.size)document.querySelectorAll('iframe[src],img[src],embed[src],object[data]').forEach(function(e){"
        + "var v=e.src||e.data||'';if(s.has(v)||(e.currentSrc&&s.has(e.currentSrc)))hide(e)})"
        + "}catch(x){}})(";

    private static final String COLLAPSE_TAIL = ");";

    static final String START_BASE_URL = "https://start.invalid/";
    private static final String BACKGROUNDS_ASSET = "browser/backgrounds.js";
    private static final String PAINT_ASSET = "browser/paint.js";
    private static final String START_ASSET = "browser/start.js";
    private static final String AUTOFILL_ASSET = "browser/autofill.js";
    private static volatile String autofillCache = null;
    private static final String START_HEAD =
        "<!doctype html><html><head><meta charset=\"utf-8\">"
        + "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; worker-src blob:; style-src 'unsafe-inline'\">"
        + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        + "<style>html,body{margin:0;height:100%;overflow:hidden;background:#0A0E0A}canvas{display:block;width:100vw;height:100vh}</style>"
        + "</head><body><canvas id=\"stage\"></canvas><script id=\"art\">";
    private static final String START_MIDDLE = "</script><script id=\"paint\">";
    private static final String START_DRIVER = "</script><script>";
    private static final String START_TAIL = "</script></body></html>";

    private BrowserScripts() {}

    static String startHtml(String backgrounds, String painter, String driver) {
        return START_HEAD + backgrounds + START_MIDDLE + painter + START_DRIVER + driver + START_TAIL;
    }

    static String startHtml(Context context) {
        try {
            return startHtml(asset(context, BACKGROUNDS_ASSET), asset(context, PAINT_ASSET), asset(context, START_ASSET));
        } catch (Exception e) {
            return null;
        }
    }

    static String autofill(Context context) {
        String cached = autofillCache;
        if (cached != null) return cached;
        try {
            cached = asset(context, AUTOFILL_ASSET);
            autofillCache = cached;
            return cached;
        } catch (Exception e) {
            return null;
        }
    }

    static String paint(int seed) {
        return "paintStart(" + seed + ")";
    }

    static String exportStart(int id) {
        return "exportStart(" + id + ")";
    }

    static String takeExport(int id) {
        return "takeExport(" + id + ")";
    }

    private static String asset(Context context, String name) throws Exception {
        try (InputStream in = context.getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    static String collapse(Collection<String> blockedUrls) {
        JSONArray urls = new JSONArray();
        for (String url : blockedUrls) urls.put(url);
        return COLLAPSE_HEAD + urls.toString() + COLLAPSE_TAIL;
    }
}
