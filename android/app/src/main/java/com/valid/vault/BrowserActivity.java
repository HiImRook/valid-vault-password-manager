package com.valid.vault;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.content.res.Configuration;
import android.text.InputType;
import android.text.format.Formatter;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebViewDatabase;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.RequiresApi;
import androidx.webkit.ProxyController;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

public class BrowserActivity extends Activity {

    static final String EXTRA_URL = "vv_browser_url";
    static final String EXTRA_FOCUS = "vv_browser_focus";
    static final String ACTION_SEARCH = "com.valid.vault.SEARCH";

    private static final String DATA_SUFFIX = "browser";
    private static final String TASK_LABEL = "Search";
    private static final int COLOR_BG = Color.parseColor("#0A0E0A");
    private static final int COLOR_BAR = Color.parseColor("#0D130D");
    private static final int COLOR_GREEN = Color.parseColor("#33FF66");
    private static final int COLOR_DIM = Color.parseColor("#6FAE7F");
    private static final int COLOR_BORDER = Color.parseColor("#1F9E40");
    private static final int COLOR_TEXT = Color.parseColor("#B8F0C4");
    private static final int COLOR_OFF = Color.parseColor("#FF5555");
    private static final int COLOR_TOR_BAR = Color.parseColor("#1C1030");
    private static final int COLOR_TOR_ACCENT = Color.parseColor("#C29BFF");
    private static final int COLOR_TOR_BORDER = Color.parseColor("#7A4FD0");
    private static final int TOP_ROW_DP = 60;
    private static final int PROGRESS_DP = 3;
    private static final int BOTTOM_BAR_DP = 56;
    private static final int BOX_HEIGHT_DP = 46;
    private static final int BOX_RADIUS_DP = 12;
    private static final int HOME_BOX_HEIGHT_DP = 54;
    private static final int LOGO_MAX_DP = 460;
    private static final int LOGO_MIN_DP = 120;
    private static final float LOGO_MAX_HEIGHT_SHARE = 0.48f;
    private static final int SCROLL_SLOP_DP = 6;
    private static final long BAR_ANIM_MS = 180;
    private static final long SCROLL_SETTLE_MS = 300;
    private static final long KEYBOARD_DELAY_MS = 150;
    private static final int MENU_RELOAD = 1;
    private static final int MENU_COPY = 2;
    private static final int MENU_TRACKERS = 3;
    private static final int MENU_OPEN_OUTSIDE = 4;
    private static final int MENU_CLOSE = 5;
    private static final int MENU_TOR = 6;
    private static final int MENU_NEW_IDENTITY = 7;
    private static final int MENU_SAFER = 8;
    private static final int REQUEST_STORAGE = 41;
    private static final int MAX_COLLAPSE_URLS = 200;
    private static final long COLLAPSE_DELAY_MS = 400;
    private static final Map<String, String> GPC_HEADERS = Collections.singletonMap("Sec-GPC", "1");
    private static final String HINT_NORMAL = "Search or enter address";
    private static final String HINT_TOR = "Search with Tor";
    private static final Pattern SCHEME = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:.*");
    private static final Pattern HOSTLIKE = Pattern.compile("^[^\\s/?#]+\\.[a-zA-Z]{2,}([/:?#].*)?$");
    private static final String BLANK_REASON = "No Content";
    private static boolean suffixSet = false;

    private FrameLayout root;
    private View statusScrim;
    private View navScrim;
    private LinearLayout topWrap;
    private LinearLayout bottomBar;
    private ScrollView home;
    private ImageView homeLogo;
    private TextView homeInfo;
    private WebView web;
    private EditText address;
    private ProgressBar progress;
    private TextView shield;
    private ImageButton backButton;
    private ImageButton forwardButton;
    private ValueAnimator barAnimator;
    private float barHidden = 0f;
    private float marginState = 0f;
    private long settleUntil = 0;
    private int sideLeft = 0;
    private int sideRight = 0;
    private int statusInset = 0;
    private int navInset = 0;
    private int imeInset = 0;
    private boolean homeShown = false;
    private volatile String pageHost = "";
    private volatile Set<String> allowedSnapshot = Collections.emptySet();
    private final AtomicInteger blockedCount = new AtomicInteger(0);
    private final AtomicInteger sessionBlocked = new AtomicInteger(0);
    private String engine = BrowserSettings.ENGINE_STARTPAGE;
    private final ConcurrentLinkedQueue<String> blockedUrls = new ConcurrentLinkedQueue<>();
    private final AtomicInteger blockedQueued = new AtomicInteger(0);
    private final AtomicBoolean collapseScheduled = new AtomicBoolean(false);
    private final Runnable collapseRunnable = this::collapseAds;
    private boolean ready = false;
    private Intent pendingIntent = null;
    private boolean torMode = false;
    private boolean safer = false;
    private boolean switching = false;
    private Runnable pendingDownload = null;

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private int barColor() {
        return torMode ? COLOR_TOR_BAR : COLOR_BAR;
    }

    private int accentColor() {
        return torMode ? COLOR_TOR_ACCENT : COLOR_GREEN;
    }

    private GradientDrawable box(int fill, int radiusDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setStroke(dp(1), torMode ? COLOR_TOR_BORDER : COLOR_BORDER);
        shape.setCornerRadius(dp(radiusDp));
        return shape;
    }

    private ImageButton iconButton(int icon, String label, View.OnClickListener onClick) {
        ImageButton b = new ImageButton(this);
        b.setImageResource(icon);
        b.setContentDescription(label);
        b.setScaleType(ImageView.ScaleType.CENTER);
        TypedValue ripple = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true);
        b.setBackgroundResource(ripple.resourceId);
        if (onClick != null) b.setOnClickListener(onClick);
        return b;
    }

    private static String engineName(String value) {
        if (BrowserSettings.ENGINE_DUCKDUCKGO.equals(value)) return "DuckDuckGo";
        if (BrowserSettings.ENGINE_BRAVE.equals(value)) return "Brave Search";
        return "Startpage";
    }

    private void loadSettings() {
        BrowserSettings settings = BrowserSettings.load(this);
        engine = settings.engine;
        allowedSnapshot = Collections.unmodifiableSet(new HashSet<>(settings.allowedSites));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (!supported()) {
            super.onCreate(savedInstanceState);
            Toast.makeText(this, "The private browser needs Android 9 or newer", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        build(savedInstanceState);
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void build(Bundle savedInstanceState) {
        if (!suffixSet) {
            try {
                WebView.setDataDirectorySuffix(DATA_SUFFIX);
                suffixSet = true;
            } catch (Exception e) {
                suffixSet = false;
            }
        }
        super.onCreate(savedInstanceState);
        if (!suffixSet) {
            Toast.makeText(this, "The private browser could not start", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        setTaskDescription(new ActivityManager.TaskDescription(TASK_LABEL, R.drawable.vv_logo, COLOR_BAR));
        goEdgeToEdge();
        loadSettings();
        BrowserPrivacy.loadList(this);

        root = new FrameLayout(this);
        root.setBackgroundColor(COLOR_BG);

        home = buildHome();
        root.addView(home, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        topWrap = buildTopBar();
        root.addView(topWrap, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(TOP_ROW_DP + PROGRESS_DP), Gravity.TOP));

        bottomBar = buildBottomBar();
        root.addView(bottomBar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(BOTTOM_BAR_DP), Gravity.BOTTOM));

        statusScrim = new View(this);
        statusScrim.setBackgroundColor(COLOR_BAR);
        root.addView(statusScrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP));

        navScrim = new View(this);
        navScrim.setBackgroundColor(COLOR_BAR);
        root.addView(navScrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.BOTTOM));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            readInsets(insets);
            root.setPadding(sideLeft, 0, sideRight, 0);
            layoutChrome();
            return consumed(insets);
        });

        setContentView(root);
        createWeb();
        root.requestApplyInsets();
        updateBar();
        pendingIntent = getIntent();
        Runnable start = () -> {
            if (isDestroyed()) return;
            wipe(web, this::becomeReady);
        };
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            try {
                ProxyController.getInstance().clearProxyOverride(getMainExecutor(), start);
            } catch (Exception e) {
                start.run();
            }
        } else {
            start.run();
        }
    }

    private void becomeReady() {
        if (isDestroyed() || web == null) return;
        ready = true;
        Intent intent = pendingIntent;
        pendingIntent = null;
        if (intent == null) showHome();
        else handleIntent(intent);
    }

    private void endSwitch() {
        switching = false;
        Intent intent = pendingIntent;
        pendingIntent = null;
        if (intent != null) handleIntent(intent);
    }

    private void createWeb() {
        web = new WebView(this);
        web.setBackgroundColor(COLOR_BG);
        configure(web);
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.clearCache(true);
        web.clearFormData();
        web.clearSslPreferences();
        layoutChrome();
    }

    private void destroyWeb() {
        if (web == null) return;
        WebView old = web;
        web = null;
        old.stopLoading();
        ViewGroup parent = (ViewGroup) old.getParent();
        if (parent != null) parent.removeView(old);
        old.destroy();
        blockedUrls.clear();
        blockedQueued.set(0);
        blockedCount.set(0);
        pageHost = "";
    }

    private void wipeAndCreate(Runnable after) {
        wipe(null, () -> {
            if (isDestroyed()) return;
            createWeb();
            if (after != null) after.run();
        });
    }

    @SuppressWarnings("deprecation")
    private void goEdgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @SuppressWarnings("deprecation")
    private WindowInsets consumed(WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return WindowInsets.CONSUMED;
        return insets.consumeSystemWindowInsets();
    }

    @SuppressWarnings("deprecation")
    private void readInsets(WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            statusInset = bars.top;
            navInset = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
            sideLeft = bars.left;
            sideRight = bars.right;
            imeInset = insets.isVisible(WindowInsets.Type.ime()) ? insets.getInsets(WindowInsets.Type.ime()).bottom : 0;
        } else {
            statusInset = insets.getSystemWindowInsetTop();
            navInset = insets.getStableInsetBottom();
            sideLeft = insets.getSystemWindowInsetLeft();
            sideRight = insets.getSystemWindowInsetRight();
            int bottom = insets.getSystemWindowInsetBottom();
            imeInset = bottom > navInset ? bottom : 0;
        }
    }

    private boolean keyboardUp() {
        return imeInset > 0;
    }

    private void layoutChrome() {
        if (root == null || web == null) return;
        int topH = dp(TOP_ROW_DP + PROGRESS_DP);
        int bottomH = dp(BOTTOM_BAR_DP);
        boolean keyboard = keyboardUp();

        FrameLayout.LayoutParams scrim = (FrameLayout.LayoutParams) statusScrim.getLayoutParams();
        scrim.height = statusInset;
        statusScrim.setLayoutParams(scrim);

        FrameLayout.LayoutParams nav = (FrameLayout.LayoutParams) navScrim.getLayoutParams();
        nav.height = keyboard ? 0 : navInset;
        navScrim.setLayoutParams(nav);

        FrameLayout.LayoutParams top = (FrameLayout.LayoutParams) topWrap.getLayoutParams();
        top.topMargin = statusInset;
        topWrap.setLayoutParams(top);
        topWrap.setTranslationY(-topH * barHidden);

        FrameLayout.LayoutParams bottom = (FrameLayout.LayoutParams) bottomBar.getLayoutParams();
        bottom.bottomMargin = navInset;
        bottomBar.setLayoutParams(bottom);
        bottomBar.setVisibility(keyboard ? View.GONE : View.VISIBLE);
        bottomBar.setTranslationY(bottomH * barHidden);

        FrameLayout.LayoutParams page = (FrameLayout.LayoutParams) web.getLayoutParams();
        int pageTop = statusInset + Math.round(topH * (1f - marginState));
        int pageBottom = keyboard ? imeInset : navInset + Math.round(bottomH * (1f - marginState));
        if (page.topMargin != pageTop || page.bottomMargin != pageBottom) {
            page.topMargin = pageTop;
            page.bottomMargin = pageBottom;
            web.setLayoutParams(page);
        }
        web.setTranslationY(keyboard ? 0f : topH * (marginState - barHidden));

        FrameLayout.LayoutParams homeParams = (FrameLayout.LayoutParams) home.getLayoutParams();
        homeParams.topMargin = statusInset + topH;
        homeParams.bottomMargin = keyboard ? imeInset : navInset + bottomH;
        home.setLayoutParams(homeParams);
    }

    private void animateBars(float target) {
        if (barAnimator != null) barAnimator.cancel();
        if (Math.abs(barHidden - target) < 0.001f && Math.abs(marginState - target) < 0.001f) return;
        marginState = 0f;
        barAnimator = ValueAnimator.ofFloat(barHidden, target);
        barAnimator.setDuration(BAR_ANIM_MS);
        barAnimator.addUpdateListener(a -> {
            barHidden = (float) a.getAnimatedValue();
            if (a.getAnimatedFraction() >= 1f) {
                marginState = target;
                settleUntil = SystemClock.uptimeMillis() + SCROLL_SETTLE_MS;
            }
            layoutChrome();
        });
        layoutChrome();
        barAnimator.start();
    }

    private void showBars() {
        animateBars(0f);
    }

    private void hideBars() {
        if (homeShown || keyboardUp() || address.hasFocus()) return;
        animateBars(1f);
    }

    private boolean barsMoving() {
        return barAnimator != null && barAnimator.isRunning();
    }

    private LinearLayout buildTopBar() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setBackgroundColor(COLOR_BAR);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(8), dp(7), dp(2), dp(7));

        shield = new TextView(this);
        shield.setTextColor(accentColor());
        shield.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        shield.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        shield.setGravity(Gravity.CENTER);
        shield.setBackground(box(COLOR_BG, BOX_RADIUS_DP));
        shield.setContentDescription("Trackers blocked");
        shield.setOnClickListener(v -> toggleSite());
        LinearLayout.LayoutParams shieldParams = new LinearLayout.LayoutParams(dp(BOX_HEIGHT_DP), dp(BOX_HEIGHT_DP));
        shieldParams.setMargins(0, 0, dp(6), 0);
        row.addView(shield, shieldParams);

        address = new EditText(this);
        address.setSingleLine(true);
        address.setHint(HINT_NORMAL);
        address.setHintTextColor(COLOR_DIM);
        address.setTextColor(COLOR_TEXT);
        address.setTypeface(Typeface.MONOSPACE);
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        address.setSelectAllOnFocus(true);
        address.setGravity(Gravity.CENTER_VERTICAL);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        address.setPadding(dp(14), 0, dp(14), 0);
        address.setBackground(box(COLOR_BG, BOX_RADIUS_DP));
        address.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId == EditorInfo.IME_ACTION_GO || enter) {
                open(address.getText().toString());
                hideKeyboard();
                return true;
            }
            return false;
        });
        address.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) showBars();
            else if (!homeShown && hasPage()) address.setText(web.getUrl());
        });
        row.addView(address, new LinearLayout.LayoutParams(0, dp(BOX_HEIGHT_DP), 1f));

        ImageButton more = iconButton(R.drawable.vv_ic_more, "Menu", null);
        more.setOnClickListener(v -> showMenu(more));
        row.addView(more, new LinearLayout.LayoutParams(dp(44), dp(BOX_HEIGHT_DP)));

        wrap.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(TOP_ROW_DP)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(COLOR_GREEN));
        progress.setVisibility(View.INVISIBLE);
        wrap.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(PROGRESS_DP)));
        return wrap;
    }

    private LinearLayout buildBottomBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(COLOR_BAR);
        backButton = iconButton(R.drawable.vv_ic_back, "Back", v -> goBack());
        forwardButton = iconButton(R.drawable.vv_ic_forward, "Forward", v -> goForward());
        ImageButton homeButton = iconButton(R.drawable.vv_ic_home, "Home", v -> showHome());
        ImageButton bookmarks = iconButton(R.drawable.vv_ic_bookmark, "Bookmarks", v -> openBookmarks());
        ImageButton share = iconButton(R.drawable.vv_ic_share, "Share", v -> sharePage());
        for (ImageButton b : new ImageButton[] { backButton, bookmarks, homeButton, share, forwardButton }) {
            bar.addView(b, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        }
        return bar;
    }

    private ScrollView buildHome() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(COLOR_BG);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER);
        column.setPadding(dp(16), dp(12), dp(16), dp(24));

        int side = logoSide();
        homeLogo = new ImageView(this);
        homeLogo.setImageResource(R.drawable.vv_logo);
        homeLogo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        homeLogo.setContentDescription("Valid Vault");
        column.addView(homeLogo, new LinearLayout.LayoutParams(side, side));

        FrameLayout searchBox = new FrameLayout(this);
        searchBox.setBackground(box(COLOR_BG, BOX_RADIUS_DP));
        searchBox.setClickable(true);
        searchBox.setOnClickListener(v -> focusAddress());
        TextView label = new TextView(this);
        label.setText("Search privately");
        label.setTextColor(COLOR_GREEN);
        label.setTypeface(Typeface.MONOSPACE);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        searchBox.addView(label, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        ImageView glass = new ImageView(this);
        glass.setImageResource(R.drawable.vv_ic_widget_search);
        FrameLayout.LayoutParams glassParams = new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.END | Gravity.CENTER_VERTICAL);
        glassParams.setMarginEnd(dp(16));
        searchBox.addView(glass, glassParams);
        LinearLayout.LayoutParams boxParams = new LinearLayout.LayoutParams(side, dp(HOME_BOX_HEIGHT_DP));
        boxParams.setMargins(0, dp(20), 0, 0);
        column.addView(searchBox, boxParams);

        homeInfo = new TextView(this);
        homeInfo.setTextColor(COLOR_DIM);
        homeInfo.setTypeface(Typeface.MONOSPACE);
        homeInfo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        homeInfo.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(side, ViewGroup.LayoutParams.WRAP_CONTENT);
        infoParams.setMargins(0, dp(14), 0, 0);
        column.addView(homeInfo, infoParams);

        scroll.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        scroll.setVisibility(View.GONE);
        return scroll;
    }

    private int logoSide() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int byWidth = metrics.widthPixels - dp(32);
        int byHeight = Math.round(metrics.heightPixels * LOGO_MAX_HEIGHT_SHARE);
        return Math.max(dp(LOGO_MIN_DP), Math.min(Math.min(byWidth, byHeight), dp(LOGO_MAX_DP)));
    }

    private void updateHomeInfo() {
        if (homeInfo == null) return;
        int count = sessionBlocked.get();
        String mode = torMode ? (safer ? "Tor, Safer  ·  " : "Tor  ·  ") : "";
        homeInfo.setText(mode + engineName(engine) + "  ·  " + count + (count == 1 ? " tracker" : " trackers") + " blocked this session");
    }

    private void showHome() {
        if (web == null) return;
        homeShown = true;
        updateHomeInfo();
        int side = logoSide();
        LinearLayout.LayoutParams logoParams = (LinearLayout.LayoutParams) homeLogo.getLayoutParams();
        if (logoParams.width != side) {
            logoParams.width = side;
            logoParams.height = side;
            homeLogo.setLayoutParams(logoParams);
        }
        home.setVisibility(View.VISIBLE);
        home.scrollTo(0, 0);
        if (!address.hasFocus()) address.setText("");
        showBars();
        updateBar();
    }

    private void hideHome() {
        if (!homeShown) return;
        homeShown = false;
        home.setVisibility(View.GONE);
        updateBar();
    }

    private boolean hasPage() {
        if (web == null) return false;
        String url = web.getUrl();
        return url != null && isWebUrl(url);
    }

    private void goBack() {
        if (web == null) return;
        if (homeShown && hasPage()) {
            hideHome();
            address.setText(web.getUrl());
            return;
        }
        if (web.canGoBack()) web.goBack();
    }

    private void goForward() {
        if (web == null || !web.canGoForward()) return;
        hideHome();
        web.goForward();
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void configure(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(!(torMode && safer));
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSafeBrowsingEnabled(false);
        s.setUserAgentString(s.getUserAgentString().replace("; wv)", ")").replace(" Version/4.0", ""));
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(s, Collections.emptySet());
        }
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, false);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(view, BrowserScripts.GPC, BrowserScripts.ALL_ORIGINS);
            if (torMode) WebViewCompat.addDocumentStartJavaScript(view, BrowserScripts.NO_WEBRTC, BrowserScripts.ALL_ORIGINS);
        }
        view.setDownloadListener(this::onDownload);
        int slop = dp(SCROLL_SLOP_DP);
        view.setOnScrollChangeListener((v, x, y, oldX, oldY) -> {
            if (barsMoving() || homeShown || SystemClock.uptimeMillis() < settleUntil) return;
            int dy = y - oldY;
            if (y <= 0) showBars();
            else if (dy > slop) hideBars();
            else if (dy < -slop) showBars();
        });
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String scheme = request.getUrl().getScheme() == null ? "" : request.getUrl().getScheme().toLowerCase(Locale.ROOT);
                if (scheme.equals("http") || scheme.equals("https")) {
                    if (!request.isForMainFrame()) return false;
                    String cleaned = BrowserPrivacy.clean(url);
                    if (!cleaned.equals(url)) {
                        v.loadUrl(cleaned, GPC_HEADERS);
                        return true;
                    }
                    return false;
                }
                if (request.hasGesture() && (scheme.equals("mailto") || scheme.equals("tel") || scheme.equals("sms") || scheme.equals("geo"))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception e) {}
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                if (request.isForMainFrame()) return null;
                String url = request.getUrl().toString();
                if (!BrowserPrivacy.shouldBlock(url, pageHost, allowedSnapshot)) return null;
                blockedCount.incrementAndGet();
                sessionBlocked.incrementAndGet();
                if (blockedQueued.incrementAndGet() <= MAX_COLLAPSE_URLS) blockedUrls.add(url);
                runOnUiThread(() -> {
                    updateShield();
                    scheduleCollapse();
                });
                return new WebResourceResponse("text/plain", "utf-8", 204, BLANK_REASON, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                if (v != web || !isWebUrl(url)) return;
                pageHost = BrowserPrivacy.hostOf(url);
                blockedCount.set(0);
                blockedUrls.clear();
                blockedQueued.set(0);
                hideHome();
                progress.setVisibility(View.VISIBLE);
                if (!address.hasFocus()) address.setText(url);
                showBars();
                updateBar();
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                if (v == web) {
                    wipe(null, null);
                    ((ViewGroup) web.getParent()).removeView(web);
                    web.destroy();
                    web = null;
                    try {
                        WebView scratch = new WebView(BrowserActivity.this);
                        scratch.clearCache(true);
                        scratch.destroy();
                    } catch (Exception e) {
                    }
                }
                Toast.makeText(BrowserActivity.this, "The page crashed, so the browser closed", Toast.LENGTH_SHORT).show();
                finish();
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (v != web) return;
                progress.setVisibility(View.INVISIBLE);
                updateBar();
                scheduleCollapse();
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean isReload) {
                if (v != web) return;
                if (!address.hasFocus() && !homeShown && isWebUrl(url)) address.setText(url);
                updateBar();
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int newProgress) {
                if (v != web) return;
                progress.setProgress(newProgress);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
        });
    }

    private void scheduleCollapse() {
        if (root == null || !collapseScheduled.compareAndSet(false, true)) return;
        root.postDelayed(collapseRunnable, COLLAPSE_DELAY_MS);
    }

    private void collapseAds() {
        collapseScheduled.set(false);
        if (web == null || !hasPage() || (torMode && safer)) return;
        if (BrowserPrivacy.siteAllowed(pageHost, allowedSnapshot)) return;
        List<String> urls = new ArrayList<>(blockedUrls);
        web.evaluateJavascript(BrowserScripts.collapse(urls), null);
    }

    private void updateBar() {
        if (web == null) return;
        boolean canBack = (homeShown && hasPage()) || (!homeShown && web.canGoBack());
        backButton.setAlpha(canBack ? 1f : 0.35f);
        forwardButton.setAlpha(web.canGoForward() ? 1f : 0.35f);
        updateShield();
    }

    private void updateShield() {
        if (shield == null) return;
        boolean off = !homeShown && BrowserPrivacy.siteAllowed(pageHost, allowedSnapshot);
        shield.setText(off ? "off" : String.valueOf(homeShown ? sessionBlocked.get() : blockedCount.get()));
        shield.setTextColor(off ? COLOR_OFF : accentColor());
        if (homeShown) updateHomeInfo();
    }

    private void toggleSite() {
        if (web == null) return;
        String site = BrowserSettings.normalizeSite(pageHost);
        if (homeShown || site.isEmpty()) {
            Toast.makeText(this, "Trackers blocked this session: " + sessionBlocked.get(), Toast.LENGTH_SHORT).show();
            return;
        }
        String host = pageHost;
        BrowserSettings settings = BrowserSettings.update(this, current -> {
            if (BrowserPrivacy.siteAllowed(host, current.allowedSites)) {
                current.allowedSites.removeIf(s -> BrowserPrivacy.hostIs(host, s));
            } else {
                current.allowedSites.add(site);
            }
        });
        if (settings == null) {
            Toast.makeText(this, "Could not save the change", Toast.LENGTH_SHORT).show();
            return;
        }
        boolean nowOff = BrowserPrivacy.siteAllowed(host, settings.allowedSites);
        loadSettings();
        Toast.makeText(this, nowOff ? "Tracker blocking off for " + site : "Tracker blocking on for " + site, Toast.LENGTH_SHORT).show();
        web.reload();
    }

    private String currentUrl() {
        if (web == null || homeShown) return null;
        String url = web.getUrl();
        return url != null && isWebUrl(url) ? url : null;
    }

    private void showMenu(View anchor) {
        PopupMenu popup = new PopupMenu(this, anchor);
        Menu menu = popup.getMenu();
        boolean page = currentUrl() != null;
        boolean off = page && BrowserPrivacy.siteAllowed(pageHost, allowedSnapshot);
        menu.add(Menu.NONE, MENU_RELOAD, 1, "Reload").setEnabled(page);
        menu.add(Menu.NONE, MENU_COPY, 2, "Copy link").setEnabled(page);
        menu.add(Menu.NONE, MENU_TRACKERS, 3, off ? "Turn tracker blocking on for this site" : "Turn tracker blocking off for this site").setEnabled(page);
        menu.add(Menu.NONE, MENU_OPEN_OUTSIDE, 4, "Open in another app").setEnabled(page);
        menu.add(Menu.NONE, MENU_TOR, 5, torMode ? "Turn Tor mode off" : "Turn Tor mode on").setEnabled(!switching);
        if (torMode) {
            menu.add(Menu.NONE, MENU_NEW_IDENTITY, 6, "New identity").setEnabled(!switching);
            menu.add(Menu.NONE, MENU_SAFER, 7, "Safer: JavaScript off").setCheckable(true).setChecked(safer).setEnabled(!switching);
        }
        menu.add(Menu.NONE, MENU_CLOSE, 8, "Close and wipe");
        popup.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            if (id == MENU_RELOAD && web != null) web.reload();
            else if (id == MENU_COPY) copyLink();
            else if (id == MENU_TRACKERS) toggleSite();
            else if (id == MENU_OPEN_OUTSIDE) openOutside();
            else if (id == MENU_TOR) {
                if (torMode) stopTor();
                else startTor();
            }
            else if (id == MENU_NEW_IDENTITY) newIdentity();
            else if (id == MENU_SAFER) toggleSafer();
            else if (id == MENU_CLOSE) finish();
            return true;
        });
        popup.show();
    }

    private void applyTheme() {
        int bar = barColor();
        topWrap.setBackgroundColor(bar);
        bottomBar.setBackgroundColor(bar);
        statusScrim.setBackgroundColor(bar);
        navScrim.setBackgroundColor(bar);
        shield.setBackground(box(COLOR_BG, BOX_RADIUS_DP));
        address.setBackground(box(COLOR_BG, BOX_RADIUS_DP));
        address.setHint(torMode ? HINT_TOR : HINT_NORMAL);
        progress.setProgressTintList(ColorStateList.valueOf(accentColor()));
        setTaskDescription(new ActivityManager.TaskDescription(TASK_LABEL, R.drawable.vv_logo, bar));
        updateShield();
        updateHomeInfo();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void startTor() {
        if (switching || torMode) return;
        if (!BrowserTor.supported()) {
            toast("Tor mode needs a newer Android System WebView. Update it from the Play Store, then try again.");
            return;
        }
        switching = true;
        Toast.makeText(this, "Checking Orbot", Toast.LENGTH_SHORT).show();
        Thread check = new Thread(() -> {
            boolean ok = BrowserTor.socksReady();
            runOnUiThread(() -> {
                if (isDestroyed()) return;
                if (!ok) {
                    endSwitch();
                    showOrbotMissing();
                    return;
                }
                enterTor();
            });
        });
        check.start();
    }

    private void enterTor() {
        destroyWeb();
        homeShown = false;
        try {
            ProxyController.getInstance().setProxyOverride(BrowserTor.config(), getMainExecutor(), () -> {
                if (isDestroyed()) return;
                torMode = true;
                safer = false;
                wipeAndCreate(() -> {
                    applyTheme();
                    showHome();
                    endSwitch();
                    showTorNote();
                });
            });
        } catch (Exception e) {
            torMode = false;
            wipeAndCreate(() -> {
                applyTheme();
                showHome();
                endSwitch();
                toast("Tor mode could not start on this phone");
            });
        }
    }

    private void stopTor() {
        if (switching || !torMode) return;
        switching = true;
        destroyWeb();
        homeShown = false;
        Runnable after = () -> {
            if (isDestroyed()) return;
            torMode = false;
            safer = false;
            wipeAndCreate(() -> {
                applyTheme();
                showHome();
                endSwitch();
                toast("Tor mode is off. Everything from the Tor session was cleared.");
            });
        };
        try {
            ProxyController.getInstance().clearProxyOverride(getMainExecutor(), after);
        } catch (Exception e) {
            after.run();
        }
    }

    private void newIdentity() {
        if (switching || !torMode) return;
        switching = true;
        destroyWeb();
        homeShown = false;
        wipeAndCreate(() -> {
            showHome();
            endSwitch();
            toast("New identity. Cookies, logins and history from this session were cleared. For a new Tor route too, refresh the connection in Orbot.");
        });
    }

    private void toggleSafer() {
        if (!torMode || web == null || switching) return;
        safer = !safer;
        web.getSettings().setJavaScriptEnabled(!safer);
        if (hasPage()) web.reload();
        updateHomeInfo();
        toast(safer ? "Safer is on. JavaScript is off, so some sites will lose menus, logins and video." : "Safer is off. JavaScript is back on.");
    }

    private void showTorNote() {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle("Tor mode is on")
            .setMessage("Every page now goes through Orbot. If Orbot stops, pages stop loading until it is running again.\n\n"
                + "Sites can no longer see your IP address or location. They can still see some details about your phone's browser.\n\n"
                + "Signing in tells that site who you are. After using a site you signed into, tap New identity in this menu and refresh the connection in Orbot before you visit anything else.\n\n"
                + "Downloads are off while Tor mode is on.")
            .setPositiveButton("Got it", null)
            .show();
    }

    private void showOrbotMissing() {
        if (isFinishing()) return;
        Intent launch = BrowserTor.launchIntent(this);
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
            .setTitle("Orbot isn't running")
            .setNegativeButton("Cancel", null);
        if (launch != null) {
            builder.setMessage("Tor mode needs Orbot to be running. Open Orbot, tap Start, then turn Tor mode on again.")
                .setPositiveButton("Open Orbot", (d, w) -> {
                    try { startActivity(launch); } catch (Exception e) { toast("Could not open Orbot"); }
                });
        } else {
            builder.setMessage("Tor mode needs Orbot, the Tor Project's app. Install it, start it, then turn Tor mode on again.")
                .setPositiveButton("Get Orbot", (d, w) -> {
                    try {
                        startActivity(BrowserTor.storeIntent(false));
                    } catch (Exception e) {
                        try { startActivity(BrowserTor.storeIntent(true)); } catch (Exception ignored) { toast("Could not open the store"); }
                    }
                });
        }
        builder.show();
    }

    private void onDownload(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        if (torMode) {
            toast("Downloads are off while Tor mode is on");
            return;
        }
        if (!BrowserDownloads.downloadable(url)) {
            toast("This file can't be downloaded here");
            return;
        }
        String name = BrowserDownloads.fileName(url, contentDisposition, mimeType);
        String pageUrl = hasPage() ? web.getUrl() : null;
        String size = contentLength > 0 ? Formatter.formatShortFileSize(this, contentLength) : null;
        new AlertDialog.Builder(this)
            .setTitle("Download this file?")
            .setMessage(size == null ? name : name + "\n" + size)
            .setPositiveButton("Download", (d, w) -> startDownload(url, userAgent, mimeType, name, pageUrl))
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void startDownload(String url, String userAgent, String mimeType, String name, String pageUrl) {
        if (torMode) return;
        Runnable run = () -> {
            if (torMode) return;
            boolean ok = BrowserDownloads.enqueue(this, url, userAgent, mimeType, name, pageUrl);
            toast(ok ? "Downloading " + name + " to Downloads" : "Could not start the download");
        };
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = run;
            requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, REQUEST_STORAGE);
            return;
        }
        run.run();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_STORAGE) return;
        Runnable run = pendingDownload;
        pendingDownload = null;
        if (run == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) run.run();
        else toast("Downloads need storage access on this version of Android");
    }

    private void copyLink() {
        String url = currentUrl();
        if (url == null) return;
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) return;
        clipboard.setPrimaryClip(ClipData.newPlainText("Link", url));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) Toast.makeText(this, "Link copied", Toast.LENGTH_SHORT).show();
    }

    private void openOutside() {
        String url = currentUrl();
        if (url == null) return;
        try {
            startActivity(Intent.createChooser(new Intent(Intent.ACTION_VIEW, Uri.parse(url)), "Open with"));
        } catch (Exception e) {
            Toast.makeText(this, "No other app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    private void sharePage() {
        String url = currentUrl();
        if (url == null) {
            Toast.makeText(this, "Open a page to share it", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, url);
        String title = web.getTitle();
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        try {
            startActivity(Intent.createChooser(send, "Share link"));
        } catch (Exception e) {
            Toast.makeText(this, "Could not share this link", Toast.LENGTH_SHORT).show();
        }
    }

    private void openBookmarks() {
        try {
            startActivity(LaunchTarget.tabIntent(this, LaunchTarget.TAB_BOOKMARKS));
        } catch (Exception e) {
            Toast.makeText(this, "Could not open Bookmarks", Toast.LENGTH_SHORT).show();
        }
    }

    private static boolean isWebUrl(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    private void open(String input) {
        if (web == null || switching || !ready) return;
        String text = input == null ? "" : input.trim();
        if (text.isEmpty()) return;
        String url;
        if (SCHEME.matcher(text).matches() && text.contains("://")) {
            if (!isWebUrl(text)) {
                Toast.makeText(this, "Only web addresses open here", Toast.LENGTH_SHORT).show();
                return;
            }
            url = text;
        } else if (!text.contains(" ") && HOSTLIKE.matcher(text).matches()) {
            url = "https://" + text;
        } else {
            url = BrowserSettings.searchUrl(engine, text);
        }
        address.clearFocus();
        hideHome();
        web.loadUrl(BrowserPrivacy.clean(url), GPC_HEADERS);
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(address.getWindowToken(), 0);
        address.clearFocus();
    }

    private void focusAddress() {
        showBars();
        address.requestFocus();
        address.selectAll();
        address.postDelayed(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(address, InputMethodManager.SHOW_IMPLICIT);
        }, KEYBOARD_DELAY_MS);
    }

    private void handleIntent(Intent intent) {
        if (intent == null || web == null) return;
        boolean internal = intent.getComponent() != null && BrowserActivity.class.getName().equals(intent.getComponent().getClassName());
        String url = internal ? intent.getStringExtra(EXTRA_URL) : null;
        if (url != null && isWebUrl(url)) {
            hideHome();
            web.loadUrl(BrowserPrivacy.clean(url), GPC_HEADERS);
            return;
        }
        boolean focus = intent.getBooleanExtra(EXTRA_FOCUS, false) || ACTION_SEARCH.equals(intent.getAction());
        if (!hasPage() || focus) showHome();
        if (focus) focusAddress();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!ready || switching) {
            pendingIntent = intent;
            return;
        }
        handleIntent(intent);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (homeLogo == null) return;
        int side = logoSide();
        LinearLayout.LayoutParams logoParams = (LinearLayout.LayoutParams) homeLogo.getLayoutParams();
        if (logoParams.width != side) {
            logoParams.width = side;
            logoParams.height = side;
            homeLogo.setLayoutParams(logoParams);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web == null) return;
        loadSettings();
        updateShield();
    }

    @Override
    public void onBackPressed() {
        if (address != null && address.hasFocus()) {
            hideKeyboard();
            return;
        }
        if (web != null && homeShown && hasPage()) {
            goBack();
            return;
        }
        if (web != null && !homeShown && web.canGoBack()) {
            web.goBack();
            return;
        }
        finish();
    }

    private void wipe(WebView view, Runnable done) {
        WebStorage.getInstance().deleteAllData();
        GeolocationPermissions.getInstance().clearAll();
        WebViewDatabase.getInstance(this).clearHttpAuthUsernamePassword();
        if (view != null) {
            view.clearCache(true);
            view.clearHistory();
            view.clearFormData();
            view.clearSslPreferences();
        }
        CookieManager cookies = CookieManager.getInstance();
        cookies.removeAllCookies(removed -> {
            cookies.flush();
            if (done != null) done.run();
        });
    }

    @Override
    protected void onDestroy() {
        if (barAnimator != null) barAnimator.cancel();
        if (root != null) root.removeCallbacks(collapseRunnable);
        if (web != null) {
            web.stopLoading();
            wipe(web, null);
            ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
        if (torMode && WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            try {
                ProxyController.getInstance().clearProxyOverride(Runnable::run, () -> {});
            } catch (Exception e) {
            }
        }
        super.onDestroy();
    }

    static Intent openIntent(Context context, String url, boolean focus) {
        Intent intent = new Intent(context, BrowserActivity.class);
        if (url != null) intent.putExtra(EXTRA_URL, url);
        intent.putExtra(EXTRA_FOCUS, focus);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }

    static boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P;
    }
}
