package com.valid.vault;

import java.util.Collection;
import java.util.Collections;
import java.util.Set;

import org.json.JSONArray;

final class BrowserScripts {

    static final Set<String> ALL_ORIGINS = Collections.singleton("*");

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

    private BrowserScripts() {}

    static String collapse(Collection<String> blockedUrls) {
        JSONArray urls = new JSONArray();
        for (String url : blockedUrls) urls.put(url);
        return COLLAPSE_HEAD + urls.toString() + COLLAPSE_TAIL;
    }
}
