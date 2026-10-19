package com.valid.vault;

import android.content.Context;
import android.webkit.WebView;

final class BrowserWebView extends WebView {

    interface TopOverscroll {
        void onTopOverscroll(BrowserWebView view);
    }

    private TopOverscroll topOverscroll = null;

    BrowserWebView(Context context) {
        super(context);
    }

    void setTopOverscroll(TopOverscroll listener) {
        topOverscroll = listener;
    }

    @Override
    protected void onOverScrolled(int scrollX, int scrollY, boolean clampedX, boolean clampedY) {
        if (clampedY && scrollY <= 0 && topOverscroll != null) topOverscroll.onTopOverscroll(this);
        super.onOverScrolled(scrollX, scrollY, clampedX, clampedY);
    }
}
