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
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.text.TextUtils;
import android.text.format.Formatter;
import android.util.Base64;
import android.util.TypedValue;
import android.view.DragEvent;
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

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
    private static final int COLOR_GLASS = Color.argb(205, 10, 14, 10);
    private static final int COLOR_SHADOW = Color.argb(230, 0, 0, 0);
    private static final int COLOR_TOR_BAR = Color.parseColor("#1C1030");
    private static final int COLOR_TOR_ACCENT = Color.parseColor("#C29BFF");
    private static final int COLOR_TOR_BORDER = Color.parseColor("#7A4FD0");
    private static final int TOP_ROW_DP = 60;
    private static final int PROGRESS_DP = 3;
    private static final int BOTTOM_BAR_DP = 56;
    private static final int BOX_HEIGHT_DP = 46;
    private static final int BOX_RADIUS_DP = 12;
    private static final int TAB_BUTTON_DP = 38;
    private static final int PIN_BADGE_DP = 54;
    private static final int PIN_COLUMNS = 4;
    private static final int START_MAX_WIDTH_DP = 520;
    private static final int SWITCHER_ROW_DP = 64;
    private static final int SCROLL_SLOP_DP = 6;
    private static final int MAX_LINK_LABEL = 80;
    private static final int START_ANCHOR_DP = 100;
    private static final int START_PAD_DP = 16;
    private static final long EXPORT_POLL_MS = 150;
    private static final long EXPORT_TIMEOUT_MS = 15000;
    private static final Pattern STYLE_NAME = Pattern.compile("[^a-z]");
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
    private static final int MENU_NEW_TAB = 9;
    private static final int MENU_PIN = 10;
    private static final int MENU_SETTINGS = 11;
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

    private final SecureRandom seedSource = new SecureRandom();
    private final BrowserTabs tabs = new BrowserTabs(seedSource::nextInt);
    private final AtomicInteger sessionBlocked = new AtomicInteger(0);

    private FrameLayout root;
    private View statusScrim;
    private View navScrim;
    private LinearLayout topWrap;
    private LinearLayout bottomBar;
    private FrameLayout startView;
    private WebView art;
    private LinearLayout pinsBox;
    private LinearLayout startColumn;
    private View startBottomSpace;
    private String dragUrl = null;
    private int dropIndex = -1;
    private boolean dropSelf = false;
    private boolean dragActive = false;
    private int exportCounter = 0;
    private boolean exporting = false;
    private TextView startInfo;
    private FrameLayout switcher;
    private LinearLayout switcherList;
    private TextView switcherTitle;
    private EditText address;
    private ProgressBar progress;
    private TextView tabButton;
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
    private boolean artReady = false;
    private Integer artPending = null;
    private volatile Set<String> allowedSnapshot = Collections.emptySet();
    private List<BrowserPins.Pin> pinsSnapshot = new ArrayList<>();
    private String engine = BrowserSettings.ENGINE_STARTPAGE;
    private boolean ready = false;
    private Intent pendingIntent = null;
    private boolean torMode = false;
    private boolean safer = false;
    private boolean switching = false;
    private boolean rendererLost = false;
    private Runnable pendingStorage = null;
    private Runnable storageDenied = null;

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private int barColor() {
        return torMode ? COLOR_TOR_BAR : COLOR_BAR;
    }

    private int accentColor() {
        return torMode ? COLOR_TOR_ACCENT : COLOR_GREEN;
    }

    private int borderColor() {
        return torMode ? COLOR_TOR_BORDER : COLOR_BORDER;
    }

    private GradientDrawable box(int fill, int radiusDp) {
        return box(fill, radiusDp, borderColor());
    }

    private GradientDrawable box(int fill, int radiusDp, int stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setStroke(dp(1), stroke);
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

    private TextView label(String text, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(color);
        view.setTypeface(Typeface.MONOSPACE, bold ? Typeface.BOLD : Typeface.NORMAL);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        return view;
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
        pinsSnapshot = new ArrayList<>(settings.pins);
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
        root.setFocusableInTouchMode(true);

        startView = buildStart();
        root.addView(startView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

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

        switcher = buildSwitcher();
        root.addView(switcher, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            readInsets(insets);
            root.setPadding(sideLeft, 0, sideRight, 0);
            layoutChrome();
            return consumed(insets);
        });

        setContentView(root);
        root.requestFocus();
        root.requestApplyInsets();
        updateBar();
        pendingIntent = getIntent();
        Runnable start = () -> {
            if (isDestroyed()) return;
            wipe(art, this::becomeReady);
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
        if (isDestroyed() || rendererLost) return;
        ready = true;
        if (tabs.size() == 0) newTab(false);
        Intent intent = pendingIntent;
        pendingIntent = null;
        if (intent != null) handleIntent(intent);
    }

    private void endSwitch() {
        switching = false;
        Intent intent = pendingIntent;
        pendingIntent = null;
        if (intent != null) handleIntent(intent);
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

    private BrowserTab activeTab() {
        return tabs.active();
    }

    private WebView activeWeb() {
        BrowserTab tab = tabs.active();
        return tab == null ? null : tab.web;
    }

    private boolean startShowing() {
        BrowserTab tab = tabs.active();
        return tab == null || tab.start;
    }

    private boolean switcherOpen() {
        return switcher != null && switcher.getVisibility() == View.VISIBLE;
    }

    private void layoutChrome() {
        if (root == null || topWrap == null) return;
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

        int pageTop = statusInset + Math.round(topH * (1f - marginState));
        int pageBottom = keyboard ? imeInset : navInset + Math.round(bottomH * (1f - marginState));
        float pageShift = keyboard ? 0f : topH * (marginState - barHidden);
        for (BrowserTab tab : tabs.list()) {
            if (tab.web == null) continue;
            FrameLayout.LayoutParams page = (FrameLayout.LayoutParams) tab.web.getLayoutParams();
            if (page.topMargin != pageTop || page.bottomMargin != pageBottom) {
                page.topMargin = pageTop;
                page.bottomMargin = pageBottom;
                tab.web.setLayoutParams(page);
            }
            tab.web.setTranslationY(pageShift);
        }

        FrameLayout.LayoutParams startParams = (FrameLayout.LayoutParams) startView.getLayoutParams();
        int startTop = statusInset + topH;
        int startBottom = navInset + bottomH;
        if (startParams.topMargin != startTop || startParams.bottomMargin != startBottom) {
            startParams.topMargin = startTop;
            startParams.bottomMargin = startBottom;
            startView.setLayoutParams(startParams);
        }

        switcher.setPadding(0, statusInset, 0, navInset);
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
        if (startShowing() || keyboardUp() || address.hasFocus() || switcherOpen()) return;
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
        address.setPadding(dp(12), 0, dp(12), 0);
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
            else showAddressOf(activeTab());
        });
        row.addView(address, new LinearLayout.LayoutParams(0, dp(BOX_HEIGHT_DP), 1f));

        tabButton = new TextView(this);
        tabButton.setTextColor(accentColor());
        tabButton.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        tabButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        tabButton.setGravity(Gravity.CENTER);
        tabButton.setBackground(box(COLOR_BG, 9));
        tabButton.setContentDescription("Tabs");
        tabButton.setOnClickListener(v -> {
            if (switcherOpen()) closeSwitcher();
            else openSwitcher();
        });
        tabButton.setOnLongClickListener(v -> {
            newTab(false);
            return true;
        });
        LinearLayout.LayoutParams tabParams = new LinearLayout.LayoutParams(dp(TAB_BUTTON_DP), dp(TAB_BUTTON_DP));
        tabParams.setMargins(dp(8), 0, dp(2), 0);
        row.addView(tabButton, tabParams);

        ImageButton more = iconButton(R.drawable.vv_ic_more, "Menu", null);
        more.setOnClickListener(v -> showMenu(more));
        row.addView(more, new LinearLayout.LayoutParams(dp(40), dp(BOX_HEIGHT_DP)));

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
        backButton = iconButton(R.drawable.vv_ic_back, "Back", v -> backButtonPressed());
        forwardButton = iconButton(R.drawable.vv_ic_forward, "Forward", v -> goForward());
        ImageButton newTabButton = iconButton(R.drawable.vv_ic_add, "New tab", v -> newTab(false));
        ImageButton bookmarks = iconButton(R.drawable.vv_ic_bookmark, "Bookmarks", v -> openVault(LaunchTarget.TAB_BOOKMARKS, "Bookmarks"));
        ImageButton share = iconButton(R.drawable.vv_ic_share, "Share", v -> sharePage());
        for (ImageButton b : new ImageButton[] { backButton, bookmarks, newTabButton, share, forwardButton }) {
            bar.addView(b, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        }
        return bar;
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private FrameLayout buildStart() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(COLOR_BG);

        art = new WebView(this);
        art.setBackgroundColor(COLOR_BG);
        art.setFocusable(false);
        art.setVerticalScrollBarEnabled(false);
        art.setHorizontalScrollBarEnabled(false);
        configureArt(art);
        frame.addView(art, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);

        LinearLayout outer = new LinearLayout(this);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setGravity(Gravity.CENTER_HORIZONTAL);
        outer.setPadding(dp(START_PAD_DP), dp(START_PAD_DP), dp(START_PAD_DP), 0);
        outer.addView(new View(this), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        startColumn = column;

        pinsBox = new LinearLayout(this);
        pinsBox.setOrientation(LinearLayout.VERTICAL);
        column.addView(pinsBox, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        startInfo = label("", 12, COLOR_DIM, false);
        startInfo.setGravity(Gravity.CENTER);
        startInfo.setShadowLayer(dp(3), 0, 0, COLOR_SHADOW);
        LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        infoParams.gravity = Gravity.CENTER_HORIZONTAL;
        infoParams.setMargins(0, dp(18), 0, 0);
        column.addView(startInfo, infoParams);

        TextView save = label("Like this background? Save it to Downloads", 12, COLOR_GREEN, false);
        save.setGravity(Gravity.CENTER);
        save.setPaintFlags(save.getPaintFlags() | Paint.UNDERLINE_TEXT_FLAG);
        save.setShadowLayer(dp(3), 0, 0, COLOR_SHADOW);
        save.setPadding(dp(8), dp(8), dp(8), dp(8));
        save.setClickable(true);
        save.setOnClickListener(v -> saveBackground());
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        saveParams.gravity = Gravity.CENTER_HORIZONTAL;
        saveParams.setMargins(0, dp(4), 0, 0);
        column.addView(save, saveParams);

        outer.addView(column, new LinearLayout.LayoutParams(startWidth(), ViewGroup.LayoutParams.WRAP_CONTENT));
        startBottomSpace = new View(this);
        outer.addView(startBottomSpace, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(START_PAD_DP)));
        scroll.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            int space = Math.max(dp(START_PAD_DP), (bottom - top) / 2 - dp(START_ANCHOR_DP));
            ViewGroup.LayoutParams params = startBottomSpace.getLayoutParams();
            if (params.height != space) {
                params.height = space;
                startBottomSpace.post(() -> startBottomSpace.setLayoutParams(params));
            }
        });
        scroll.addView(outer, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        frame.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        frame.setVisibility(View.INVISIBLE);
        String html = BrowserScripts.startHtml(this);
        if (html != null) art.loadDataWithBaseURL(BrowserScripts.START_BASE_URL, html, "text/html", "utf-8", null);
        return frame;
    }

    private int startWidth() {
        return Math.max(dp(200), Math.min(getResources().getDisplayMetrics().widthPixels - dp(32), dp(START_MAX_WIDTH_DP)));
    }

    private void renderPins() {
        if (pinsBox == null || dragActive) return;
        pinsBox.removeAllViews();
        boolean canAdd = !torMode && pinsSnapshot.size() < BrowserPins.MAX_PINS;
        int count = pinsSnapshot.size() + (canAdd ? 1 : 0);
        LinearLayout row = null;
        for (int i = 0; i < count; i++) {
            if (i % PIN_COLUMNS == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                rowParams.setMargins(0, i == 0 ? 0 : dp(12), 0, 0);
                pinsBox.addView(row, rowParams);
            }
            View tile = i < pinsSnapshot.size() ? pinTile(pinsSnapshot.get(i), i) : addTile();
            row.addView(tile, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        }
        int filler = (PIN_COLUMNS - count % PIN_COLUMNS) % PIN_COLUMNS;
        for (int i = 0; i < filler && row != null; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
    }

    private LinearLayout tileFrame(String letter, String text, int letterColor) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER_HORIZONTAL);
        tile.setClickable(true);
        tile.setContentDescription(text);
        TextView badge = label(letter, 22, letterColor, true);
        badge.setGravity(Gravity.CENTER);
        badge.setBackground(box(COLOR_GLASS, 14));
        tile.addView(badge, new LinearLayout.LayoutParams(dp(PIN_BADGE_DP), dp(PIN_BADGE_DP)));
        TextView name = label(text, 11, COLOR_TEXT, false);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setGravity(Gravity.CENTER);
        name.setShadowLayer(dp(3), 0, 0, COLOR_SHADOW);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nameParams.setMargins(dp(2), dp(5), dp(2), 0);
        tile.addView(name, nameParams);
        return tile;
    }

    private View addTile() {
        LinearLayout tile = tileFrame("+", "Add site", COLOR_DIM);
        tile.setOnClickListener(v -> showAddSite());
        return tile;
    }

    private View pinTile(BrowserPins.Pin pin, int index) {
        LinearLayout tile = tileFrame(BrowserPins.letter(pin), BrowserPins.label(pin), accentColor());
        View badge = tile.getChildAt(0);
        tile.setOnClickListener(v -> openPin(pin));
        tile.setOnLongClickListener(v -> {
            dragUrl = pin.url;
            dropIndex = -1;
            dropSelf = false;
            dragActive = true;
            v.setAlpha(0.45f);
            if (!v.startDragAndDrop(null, new View.DragShadowBuilder(v), pin.url, 0)) {
                dragActive = false;
                v.setAlpha(1f);
                pinMenu(pin);
            }
            return true;
        });
        tile.setOnDragListener((v, event) -> {
            boolean self = pin.url.equals(dragUrl);
            switch (event.getAction()) {
                case DragEvent.ACTION_DRAG_STARTED:
                    return dragActive;
                case DragEvent.ACTION_DRAG_ENTERED:
                    if (!self) badge.setBackground(box(COLOR_GLASS, 14, accentColor()));
                    return true;
                case DragEvent.ACTION_DRAG_EXITED:
                    badge.setBackground(box(COLOR_GLASS, 14));
                    return true;
                case DragEvent.ACTION_DROP:
                    badge.setBackground(box(COLOR_GLASS, 14));
                    if (self) dropSelf = true;
                    else dropIndex = index;
                    return true;
                case DragEvent.ACTION_DRAG_ENDED:
                    badge.setBackground(box(COLOR_GLASS, 14));
                    v.setAlpha(1f);
                    if (self) finishDrag(pin);
                    return true;
                default:
                    return true;
            }
        });
        return tile;
    }

    private void finishDrag(BrowserPins.Pin pin) {
        if (!dragActive) return;
        dragActive = false;
        String url = dragUrl;
        int to = dropIndex;
        boolean menu = dropSelf;
        dragUrl = null;
        dropIndex = -1;
        dropSelf = false;
        root.post(() -> {
            if (isDestroyed()) return;
            if (to >= 0) movePin(url, to);
            else if (menu) pinMenu(pin);
            else renderPins();
        });
    }

    private void movePin(String url, int to) {
        BrowserSettings saved = BrowserSettings.update(this, settings -> BrowserPins.move(settings.pins, url, to));
        if (saved == null) {
            toast("Could not save the change");
            return;
        }
        loadSettings();
        renderPins();
    }

    private void showAddSite() {
        if (isFinishing() || torMode) return;
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), 0);
        EditText name = new EditText(this);
        name.setHint("Name");
        name.setSingleLine(true);
        name.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        form.addView(name);
        EditText site = new EditText(this);
        site.setHint("Address, like example.com");
        site.setSingleLine(true);
        site.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        form.addView(site);
        new AlertDialog.Builder(this)
            .setTitle("Add a site to the start page")
            .setView(form)
            .setPositiveButton("Add", (d, w) -> {
                String url = BrowserPins.fromInput(site.getText().toString());
                if (url == null) {
                    toast("Enter a web address, like example.com");
                    return;
                }
                if (BrowserPins.contains(pinsSnapshot, url)) {
                    toast("That site is already on the start page");
                    return;
                }
                setPinned(url, name.getText().toString(), true);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void saveBackground() {
        BrowserTab tab = activeTab();
        if (tab == null || art == null || !artReady || exporting) return;
        exporting = true;
        int id = ++exportCounter;
        int seed = tab.seed;
        art.evaluateJavascript(BrowserScripts.exportStart(id), null);
        pollExport(id, seed, SystemClock.uptimeMillis() + EXPORT_TIMEOUT_MS);
    }

    private void pollExport(int id, int seed, long deadline) {
        if (art == null || isDestroyed()) {
            exporting = false;
            return;
        }
        art.evaluateJavascript(BrowserScripts.takeExport(id), value -> {
            if (value == null || value.equals("null")) {
                if (SystemClock.uptimeMillis() < deadline && root != null) root.postDelayed(() -> pollExport(id, seed, deadline), EXPORT_POLL_MS);
                else {
                    exporting = false;
                    toast("Could not save the background");
                }
                return;
            }
            withStorage(() -> {
                Thread writer = new Thread(() -> {
                    String saved = null;
                    try {
                        JSONObject result = new JSONObject(value);
                        if (!result.optBoolean("error", false)) {
                            String style = STYLE_NAME.matcher(result.optString("style", "").toLowerCase(Locale.ROOT)).replaceAll("");
                            String name = "valid-vault-" + (style.isEmpty() ? "background" : style) + "-" + Integer.toHexString(seed) + ".png";
                            if (BrowserDownloads.saveImage(getApplicationContext(), name, Base64.decode(result.getString("data"), Base64.DEFAULT))) saved = name;
                        }
                    } catch (Throwable e) {
                        saved = null;
                    }
                    String name = saved;
                    runOnUiThread(() -> {
                        exporting = false;
                        if (isDestroyed()) return;
                        toast(name != null ? "Saved " + name + " to Downloads" : "Could not save the background");
                    });
                });
                writer.start();
            }, () -> exporting = false);
        });
    }

    private void openPin(BrowserPins.Pin pin) {
        BrowserTab tab = activeTab();
        if (tab == null || switching || !ready) return;
        loadInTab(tab, pin.url);
    }

    private void pinMenu(BrowserPins.Pin pin) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle(BrowserPins.label(pin))
            .setItems(new CharSequence[] { "Open in new tab", "Remove from start page" }, (d, which) -> {
                if (which == 0) openInNewTab(pin.url, true);
                else setPinned(pin.url, "", false);
            })
            .show();
    }

    private void setPinned(String url, String title, boolean pin) {
        boolean[] changed = { false };
        boolean[] full = { false };
        BrowserSettings saved = BrowserSettings.update(this, settings -> {
            if (pin) {
                full[0] = settings.pins.size() >= BrowserPins.MAX_PINS;
                changed[0] = BrowserPins.add(settings.pins, url, title);
            } else {
                changed[0] = BrowserPins.remove(settings.pins, url);
            }
        });
        if (saved == null) {
            toast("Could not save the change");
            return;
        }
        loadSettings();
        renderPins();
        if (pin && full[0]) toast("The start page holds " + BrowserPins.MAX_PINS + " sites. Remove one first.");
        else if (changed[0]) toast(pin ? "Added to the start page" : "Removed from the start page");
    }

    private void updateStartInfo() {
        if (startInfo == null) return;
        int count = sessionBlocked.get();
        String mode = torMode ? (safer ? "Tor, Safer  ·  " : "Tor  ·  ") : "";
        startInfo.setText(mode + engineName(engine) + "  ·  " + count + (count == 1 ? " tracker" : " trackers") + " blocked this session");
    }

    private FrameLayout buildSwitcher() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(COLOR_BG);
        frame.setClickable(true);
        frame.setVisibility(View.GONE);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(16), dp(10), dp(8), dp(10));
        switcherTitle = label("Tabs", 17, COLOR_TEXT, true);
        header.addView(switcherTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView closeAll = label("Close all", 14, COLOR_DIM, false);
        closeAll.setPadding(dp(10), dp(10), dp(10), dp(10));
        closeAll.setOnClickListener(v -> confirmCloseAll());
        header.addView(closeAll);
        TextView add = label("New tab", 14, COLOR_GREEN, true);
        add.setPadding(dp(10), dp(10), dp(10), dp(10));
        add.setOnClickListener(v -> newTab(false));
        header.addView(add);
        column.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ScrollView scroll = new ScrollView(this);
        switcherList = new LinearLayout(this);
        switcherList.setOrientation(LinearLayout.VERTICAL);
        switcherList.setPadding(dp(12), dp(4), dp(12), dp(16));
        scroll.addView(switcherList, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        column.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        frame.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return frame;
    }

    private String tabTitle(BrowserTab tab) {
        if (tab.start || !hasPage(tab)) return "New tab";
        if (tab.title != null && !tab.title.trim().isEmpty()) return tab.title.trim();
        return BrowserPins.hostLabel(tab.url);
    }

    private String tabSubtitle(BrowserTab tab) {
        if (tab.start || !hasPage(tab)) return "Start page";
        return BrowserPins.hostLabel(tab.url);
    }

    private void renderSwitcher() {
        if (switcherList == null) return;
        switcherList.removeAllViews();
        int count = tabs.size();
        switcherTitle.setText(count + (count == 1 ? " tab" : " tabs") + (torMode ? "  ·  Tor" : ""));
        BrowserTab current = activeTab();
        List<BrowserTab> list = new ArrayList<>(tabs.list());
        for (BrowserTab tab : list) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(14), 0, dp(4), 0);
            boolean isActive = tab == current;
            row.setBackground(box(isActive ? COLOR_BAR : COLOR_BG, BOX_RADIUS_DP, isActive ? accentColor() : COLOR_BAR));
            row.setClickable(true);
            row.setOnClickListener(v -> {
                selectTab(tab);
                closeSwitcher();
            });

            LinearLayout text = new LinearLayout(this);
            text.setOrientation(LinearLayout.VERTICAL);
            TextView title = label(tabTitle(tab), 14, COLOR_TEXT, isActive);
            title.setSingleLine(true);
            title.setEllipsize(TextUtils.TruncateAt.END);
            text.addView(title);
            TextView sub = label(tabSubtitle(tab), 12, COLOR_DIM, false);
            sub.setSingleLine(true);
            sub.setEllipsize(TextUtils.TruncateAt.END);
            text.addView(sub);
            row.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            ImageButton close = iconButton(R.drawable.vv_ic_close, "Close tab", v -> {
                closeTab(tab);
                if (switcherOpen()) renderSwitcher();
            });
            row.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));

            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(SWITCHER_ROW_DP));
            rowParams.setMargins(0, dp(8), 0, 0);
            switcherList.addView(row, rowParams);
        }
    }

    private void openSwitcher() {
        if (!ready || switching) return;
        hideKeyboard();
        renderSwitcher();
        switcher.setVisibility(View.VISIBLE);
        switcher.bringToFront();
    }

    private void closeSwitcher() {
        if (switcher != null) switcher.setVisibility(View.GONE);
    }

    private void confirmCloseAll() {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle("Close all tabs?")
            .setMessage("Every open tab closes and a new start page opens.")
            .setPositiveButton("Close all", (d, w) -> {
                closeAllTabs();
                closeSwitcher();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void configureArt(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setBlockNetworkLoads(true);
        s.setDomStorageEnabled(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSafeBrowsingEnabled(false);
        s.setSupportZoom(false);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme() == null ? "" : request.getUrl().getScheme().toLowerCase(Locale.ROOT);
                if (scheme.equals("blob") || scheme.equals("data")) return null;
                return new WebResourceResponse("text/plain", "utf-8", 204, BLANK_REASON, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (v != art) return;
                artReady = true;
                Integer seed = artPending;
                artPending = null;
                if (seed != null) paintArt(seed);
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                rendererGone();
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
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

    private void paintArt(int seed) {
        if (art == null) return;
        if (!artReady) {
            artPending = seed;
            return;
        }
        art.evaluateJavascript(BrowserScripts.paint(seed), null);
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void createWeb(BrowserTab tab) {
        WebView view = new WebView(this);
        view.setBackgroundColor(COLOR_BG);
        tab.web = view;
        configure(tab, view);
        view.setVisibility(View.GONE);
        root.addView(view, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        layoutChrome();
    }

    private void destroyWeb(BrowserTab tab) {
        if (tab == null || tab.web == null) return;
        WebView old = tab.web;
        tab.web = null;
        if (root != null && tab.collapse != null) root.removeCallbacks(tab.collapse);
        old.stopLoading();
        ViewGroup parent = (ViewGroup) old.getParent();
        if (parent != null) parent.removeView(old);
        old.destroy();
        tab.resetPage();
        tab.pageHost = "";
    }

    private void destroyAllWebs() {
        for (BrowserTab tab : tabs.list()) destroyWeb(tab);
    }

    private boolean hasPage(BrowserTab tab) {
        if (tab == null || tab.web == null) return false;
        String url = tab.web.getUrl();
        return url != null && isWebUrl(url);
    }

    private void deactivate(BrowserTab tab) {
        if (tab == null || tab.web == null) return;
        if (hasPage(tab)) tab.web.evaluateJavascript(BrowserScripts.PAUSE_MEDIA, null);
        tab.web.setVisibility(View.GONE);
        tab.web.onPause();
    }

    private void showAddressOf(BrowserTab tab) {
        if (address == null || address.hasFocus()) return;
        if (tab == null || tab.start || !hasPage(tab)) address.setText("");
        else address.setText(tab.web.getUrl());
    }

    private void showStart(BrowserTab tab) {
        if (tab == null) return;
        tab.start = true;
        if (tab.web != null) {
            tab.web.setVisibility(View.GONE);
            tab.web.onPause();
        }
        progress.setVisibility(View.INVISIBLE);
        renderPins();
        updateStartInfo();
        startView.setVisibility(View.VISIBLE);
        paintArt(tab.seed);
        showAddressOf(tab);
        showBars();
        updateBar();
    }

    private void showPage(BrowserTab tab) {
        if (tab == null || tab.web == null) return;
        tab.start = false;
        startView.setVisibility(View.INVISIBLE);
        tab.web.setVisibility(View.VISIBLE);
        tab.web.onResume();
        progress.setVisibility(tab.web.getProgress() < 100 ? View.VISIBLE : View.INVISIBLE);
        progress.setProgress(tab.web.getProgress());
        showAddressOf(tab);
        showBars();
        updateBar();
    }

    private void showActive() {
        BrowserTab tab = activeTab();
        if (tab == null) return;
        for (BrowserTab other : tabs.list()) if (other != tab) deactivate(other);
        if (tab.start || tab.web == null) showStart(tab);
        else showPage(tab);
    }

    private void selectTab(BrowserTab tab) {
        if (tab == null || switching) return;
        BrowserTab current = activeTab();
        if (current == tab) {
            showActive();
            return;
        }
        deactivate(current);
        tabs.select(tab.id);
        showActive();
    }

    private BrowserTab newTab(boolean focus) {
        if (!ready || switching) return null;
        if (tabs.full()) {
            toast(BrowserTabs.MAX_TABS + " tabs are open. Close one to open another.");
            return null;
        }
        deactivate(activeTab());
        BrowserTab tab = tabs.open();
        closeSwitcher();
        showActive();
        if (focus) focusAddress();
        return tab;
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void openInNewTab(String url, boolean switchTo) {
        if (!ready || switching || !isWebUrl(url)) return;
        if (tabs.full()) {
            toast(BrowserTabs.MAX_TABS + " tabs are open. Close one to open another.");
            return;
        }
        BrowserTab current = activeTab();
        BrowserTab tab = tabs.open();
        tab.fromStart = false;
        tab.start = false;
        createWeb(tab);
        tab.web.loadUrl(BrowserPrivacy.clean(url), GPC_HEADERS);
        if (switchTo || current == null) {
            deactivate(current);
            showActive();
        } else {
            tab.web.onPause();
            tabs.select(current.id);
            updateBar();
            toast("Opened in a new tab");
        }
    }

    private void closeTab(BrowserTab tab) {
        if (tab == null || switching) return;
        boolean wasActive = tab == activeTab();
        destroyWeb(tab);
        tabs.close(tab.id);
        if (tabs.size() == 0) tabs.open();
        if (wasActive || tabs.size() == 1) showActive();
        else updateBar();
    }

    private void closeAllTabs() {
        if (switching) return;
        destroyAllWebs();
        tabs.clear();
        tabs.open();
        showActive();
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void loadInTab(BrowserTab tab, String url) {
        if (tab.web == null) createWeb(tab);
        address.clearFocus();
        tab.web.loadUrl(BrowserPrivacy.clean(url), GPC_HEADERS);
        if (tab == activeTab()) showPage(tab);
        else tab.start = false;
    }

    private void backButtonPressed() {
        BrowserTab tab = activeTab();
        if (tab == null) return;
        BrowserTabs.Back action = BrowserTabs.back(false, false, tab.start, hasPage(tab), tab.web != null && tab.web.canGoBack(), tab.fromStart, 1);
        if (action == BrowserTabs.Back.WEB_BACK) tab.web.goBack();
        else if (action == BrowserTabs.Back.SHOW_START) backToStart(tab);
    }

    private void backToStart(BrowserTab tab) {
        if (tab.web != null && !hasPage(tab)) tab.web.stopLoading();
        showStart(tab);
    }

    private void goForward() {
        BrowserTab tab = activeTab();
        if (tab == null || tab.web == null) return;
        if (tab.start && hasPage(tab)) {
            showPage(tab);
            return;
        }
        if (tab.web.canGoForward()) tab.web.goForward();
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void configure(BrowserTab tab, WebView view) {
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
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(view, BrowserScripts.GPC, BrowserScripts.ALL_ORIGINS);
            if (torMode) WebViewCompat.addDocumentStartJavaScript(view, BrowserScripts.NO_WEBRTC, BrowserScripts.ALL_ORIGINS);
        }
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, false);
        tab.collapse = () -> collapseAds(tab);
        view.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            onDownload(tab, url, userAgent, contentDisposition, mimeType, contentLength));
        view.setOnLongClickListener(v -> onLongPress(tab, (WebView) v));
        int slop = dp(SCROLL_SLOP_DP);
        view.setOnScrollChangeListener((v, x, y, oldX, oldY) -> {
            if (v != activeWeb() || startShowing() || barsMoving() || SystemClock.uptimeMillis() < settleUntil) return;
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
                if (!BrowserPrivacy.shouldBlock(url, tab.pageHost, allowedSnapshot)) return null;
                if (v != tab.web) return new WebResourceResponse("text/plain", "utf-8", 204, BLANK_REASON, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                tab.blockedCount.incrementAndGet();
                sessionBlocked.incrementAndGet();
                if (tab.blockedQueued.incrementAndGet() <= MAX_COLLAPSE_URLS) tab.blockedUrls.add(url);
                runOnUiThread(() -> {
                    if (tab == activeTab()) updateShield();
                    scheduleCollapse(tab);
                });
                return new WebResourceResponse("text/plain", "utf-8", 204, BLANK_REASON, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                if (v != tab.web || !isWebUrl(url)) return;
                tab.pageHost = BrowserPrivacy.hostOf(url);
                tab.url = url;
                tab.title = "";
                tab.resetPage();
                if (tab != activeTab() || tab.start) return;
                progress.setVisibility(View.VISIBLE);
                if (!address.hasFocus()) address.setText(url);
                showBars();
                updateBar();
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                rendererGone();
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (v != tab.web) return;
                if (isWebUrl(url)) tab.url = url;
                scheduleCollapse(tab);
                if (tab != activeTab() || tab.start) return;
                progress.setVisibility(View.INVISIBLE);
                updateBar();
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean isReload) {
                if (v != tab.web) return;
                if (isWebUrl(url)) tab.url = url;
                if (switcherOpen()) renderSwitcher();
                if (tab != activeTab() || tab.start) return;
                if (!address.hasFocus() && isWebUrl(url)) address.setText(url);
                updateBar();
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int newProgress) {
                if (v != tab.web || tab != activeTab() || tab.start) return;
                progress.setProgress(newProgress);
            }

            @Override
            public void onReceivedTitle(WebView v, String title) {
                if (v != tab.web) return;
                tab.title = title == null ? "" : title;
                if (switcherOpen()) renderSwitcher();
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

    private boolean onLongPress(BrowserTab tab, WebView view) {
        WebView.HitTestResult hit = view.getHitTestResult();
        if (hit == null) return false;
        int type = hit.getType();
        if (type == WebView.HitTestResult.SRC_ANCHOR_TYPE) {
            String url = hit.getExtra();
            if (url == null || !isWebUrl(url)) return false;
            showLinkMenu(url);
            return true;
        }
        if (type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
            Handler handler = new Handler(Looper.getMainLooper(), message -> {
                String url = message.getData() == null ? null : message.getData().getString("url");
                if (url != null && isWebUrl(url) && view == tab.web) showLinkMenu(url);
                return true;
            });
            view.requestFocusNodeHref(handler.obtainMessage());
            return true;
        }
        return false;
    }

    private void showLinkMenu(String url) {
        if (isFinishing()) return;
        String shown = url.length() > MAX_LINK_LABEL ? url.substring(0, MAX_LINK_LABEL) + "…" : url;
        new AlertDialog.Builder(this)
            .setTitle(shown)
            .setItems(new CharSequence[] { "Open in new tab", "Copy link", "Share link" }, (d, which) -> {
                if (which == 0) openInNewTab(url, false);
                else if (which == 1) copyText(url);
                else shareText(url, null);
            })
            .show();
    }

    private void scheduleCollapse(BrowserTab tab) {
        if (root == null || tab.collapse == null || !tab.collapseScheduled.compareAndSet(false, true)) return;
        root.postDelayed(tab.collapse, COLLAPSE_DELAY_MS);
    }

    private void collapseAds(BrowserTab tab) {
        tab.collapseScheduled.set(false);
        if (tab.web == null || !hasPage(tab) || (torMode && safer)) return;
        if (BrowserPrivacy.siteAllowed(tab.pageHost, allowedSnapshot)) return;
        List<String> urls = new ArrayList<>(tab.blockedUrls);
        tab.web.evaluateJavascript(BrowserScripts.collapse(urls), null);
    }

    private void updateBar() {
        BrowserTab tab = activeTab();
        boolean canBack = tab != null && !tab.start && ((hasPage(tab) && tab.web.canGoBack()) || tab.fromStart || tabs.size() <= 1);
        boolean canForward = tab != null && tab.web != null && ((tab.start && hasPage(tab)) || (!tab.start && tab.web.canGoForward()));
        if (backButton != null) backButton.setAlpha(canBack ? 1f : 0.35f);
        if (forwardButton != null) forwardButton.setAlpha(canForward ? 1f : 0.35f);
        if (tabButton != null) {
            int count = Math.max(1, tabs.size());
            tabButton.setText(String.valueOf(count));
            tabButton.setContentDescription(count + (count == 1 ? " tab open" : " tabs open"));
        }
        updateShield();
    }

    private void updateShield() {
        if (startShowing()) updateStartInfo();
    }

    private void toggleSite() {
        BrowserTab tab = activeTab();
        String site = tab == null ? "" : BrowserSettings.normalizeSite(tab.pageHost);
        if (tab == null || tab.start || !hasPage(tab) || site.isEmpty()) {
            Toast.makeText(this, "Trackers blocked this session: " + sessionBlocked.get(), Toast.LENGTH_SHORT).show();
            return;
        }
        if (torMode) {
            toast("The tracker switch is off in Tor mode, so nothing about this session is saved");
            return;
        }
        String host = tab.pageHost;
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
        tab.web.reload();
    }

    private String currentUrl() {
        BrowserTab tab = activeTab();
        if (tab == null || tab.start || !hasPage(tab)) return null;
        return tab.web.getUrl();
    }

    private void showMenu(View anchor) {
        PopupMenu popup = new PopupMenu(this, anchor);
        Menu menu = popup.getMenu();
        BrowserTab tab = activeTab();
        String url = currentUrl();
        boolean page = url != null;
        boolean off = page && BrowserPrivacy.siteAllowed(tab.pageHost, allowedSnapshot);
        boolean pinned = page && BrowserPins.contains(pinsSnapshot, url);
        menu.add(Menu.NONE, MENU_NEW_TAB, 1, "New tab").setEnabled(ready && !switching);
        menu.add(Menu.NONE, MENU_RELOAD, 2, "Reload").setEnabled(page);
        menu.add(Menu.NONE, MENU_COPY, 3, "Copy link").setEnabled(page);
        menu.add(Menu.NONE, MENU_PIN, 4, pinned ? "Remove from start page" : "Add to start page").setEnabled(page && !torMode);
        menu.add(Menu.NONE, MENU_TRACKERS, 5, off ? "Turn tracker blocking on for this site" : "Turn tracker blocking off for this site").setEnabled(page && !torMode);
        menu.add(Menu.NONE, MENU_OPEN_OUTSIDE, 6, "Open in another app").setEnabled(page);
        menu.add(Menu.NONE, MENU_TOR, 7, torMode ? "Turn Tor mode off" : "Turn Tor mode on").setEnabled(ready && !switching);
        if (torMode) {
            menu.add(Menu.NONE, MENU_NEW_IDENTITY, 8, "New identity").setEnabled(!switching);
            menu.add(Menu.NONE, MENU_SAFER, 9, "Safer: JavaScript off").setCheckable(true).setChecked(safer).setEnabled(!switching);
        }
        menu.add(Menu.NONE, MENU_SETTINGS, 10, "Valid Vault settings");
        menu.add(Menu.NONE, MENU_CLOSE, 11, "Close and wipe");
        popup.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            BrowserTab current = activeTab();
            if (id == MENU_NEW_TAB) newTab(false);
            else if (id == MENU_RELOAD && current != null && current.web != null) current.web.reload();
            else if (id == MENU_COPY) copyLink();
            else if (id == MENU_PIN) togglePin();
            else if (id == MENU_TRACKERS) toggleSite();
            else if (id == MENU_OPEN_OUTSIDE) openOutside();
            else if (id == MENU_TOR) {
                if (torMode) stopTor();
                else startTor();
            }
            else if (id == MENU_NEW_IDENTITY) newIdentity();
            else if (id == MENU_SAFER) toggleSafer();
            else if (id == MENU_SETTINGS) openVault(LaunchTarget.TAB_SETTINGS, "Settings");
            else if (id == MENU_CLOSE) finish();
            return true;
        });
        popup.show();
    }

    private void togglePin() {
        String url = currentUrl();
        if (url == null || torMode) return;
        BrowserTab tab = activeTab();
        boolean pinned = BrowserPins.contains(pinsSnapshot, url);
        setPinned(url, tab == null ? "" : tab.title, !pinned);
    }

    private void applyTheme() {
        int bar = barColor();
        topWrap.setBackgroundColor(bar);
        bottomBar.setBackgroundColor(bar);
        statusScrim.setBackgroundColor(bar);
        navScrim.setBackgroundColor(bar);
        address.setBackground(box(COLOR_BG, BOX_RADIUS_DP));
        address.setHint(torMode ? HINT_TOR : HINT_NORMAL);
        tabButton.setBackground(box(COLOR_BG, 9));
        tabButton.setTextColor(accentColor());
        progress.setProgressTintList(ColorStateList.valueOf(accentColor()));
        setTaskDescription(new ActivityManager.TaskDescription(TASK_LABEL, R.drawable.vv_logo, bar));
        renderPins();
        updateShield();
        updateStartInfo();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void resetSession(Runnable after) {
        closeSwitcher();
        hideKeyboard();
        destroyAllWebs();
        tabs.clear();
        sessionBlocked.set(0);
        startView.setVisibility(View.INVISIBLE);
        wipe(art, () -> {
            if (isDestroyed() || rendererLost) return;
            tabs.open();
            showActive();
            if (after != null) after.run();
        });
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
        closeSwitcher();
        destroyAllWebs();
        tabs.clear();
        startView.setVisibility(View.INVISIBLE);
        try {
            ProxyController.getInstance().setProxyOverride(BrowserTor.config(), getMainExecutor(), () -> {
                if (isDestroyed()) return;
                torMode = true;
                safer = false;
                resetSession(() -> {
                    applyTheme();
                    endSwitch();
                    showTorNote();
                });
            });
        } catch (Exception e) {
            torMode = false;
            resetSession(() -> {
                applyTheme();
                endSwitch();
                toast("Tor mode could not start on this phone");
            });
        }
    }

    private void stopTor() {
        if (switching || !torMode) return;
        switching = true;
        closeSwitcher();
        destroyAllWebs();
        tabs.clear();
        startView.setVisibility(View.INVISIBLE);
        Runnable after = () -> {
            if (isDestroyed()) return;
            torMode = false;
            safer = false;
            resetSession(() -> {
                applyTheme();
                endSwitch();
                toast("Tor mode is off. Everything from the Tor session was cleared.");
            });
        };
        try {
            ProxyController.getInstance().clearProxyOverride(getMainExecutor(), after);
        } catch (Exception e) {
            toast("Tor could not be fully turned off. Close the browser and open it again to use it without Tor.");
            after.run();
        }
    }

    private void newIdentity() {
        if (switching || !torMode) return;
        switching = true;
        resetSession(() -> {
            endSwitch();
            toast("New identity. Tabs, cookies, logins and history from this session were cleared. For a new Tor route too, refresh the connection in Orbot.");
        });
    }

    private void toggleSafer() {
        if (!torMode || switching) return;
        safer = !safer;
        for (BrowserTab tab : tabs.list()) {
            if (tab.web == null) continue;
            tab.web.getSettings().setJavaScriptEnabled(!safer);
            if (hasPage(tab)) tab.web.reload();
        }
        updateStartInfo();
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

    private void onDownload(BrowserTab tab, String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        if (torMode) {
            toast("Downloads are off while Tor mode is on");
            return;
        }
        if (!BrowserDownloads.downloadable(url)) {
            toast("This file can't be downloaded here");
            return;
        }
        String name = BrowserDownloads.fileName(url, contentDisposition, mimeType);
        String pageUrl = hasPage(tab) ? tab.web.getUrl() : null;
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
        withStorage(() -> {
            if (torMode) return;
            boolean ok = BrowserDownloads.enqueue(this, url, userAgent, mimeType, name, pageUrl);
            toast(ok ? "Downloading " + name + " to Downloads" : "Could not start the download");
        }, null);
    }

    private void withStorage(Runnable run, Runnable denied) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            if (pendingStorage != null) {
                if (denied != null) denied.run();
                return;
            }
            pendingStorage = run;
            storageDenied = denied;
            requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, REQUEST_STORAGE);
            return;
        }
        run.run();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_STORAGE) return;
        Runnable run = pendingStorage;
        Runnable denied = storageDenied;
        pendingStorage = null;
        storageDenied = null;
        if (run == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) run.run();
        else {
            if (denied != null) denied.run();
            toast("Saving to Downloads needs storage access on this version of Android");
        }
    }

    private void copyText(String text) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) return;
        clipboard.setPrimaryClip(ClipData.newPlainText("Link", text));
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) Toast.makeText(this, "Link copied", Toast.LENGTH_SHORT).show();
    }

    private void copyLink() {
        String url = currentUrl();
        if (url != null) copyText(url);
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

    private void shareText(String url, String title) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, url);
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        try {
            startActivity(Intent.createChooser(send, "Share link"));
        } catch (Exception e) {
            Toast.makeText(this, "Could not share this link", Toast.LENGTH_SHORT).show();
        }
    }

    private void sharePage() {
        String url = currentUrl();
        if (url == null) {
            Toast.makeText(this, "Open a page to share it", Toast.LENGTH_SHORT).show();
            return;
        }
        BrowserTab tab = activeTab();
        shareText(url, tab == null || tab.web == null ? null : tab.web.getTitle());
    }

    private void openVault(String target, String name) {
        try {
            startActivity(LaunchTarget.tabIntent(this, target));
        } catch (Exception e) {
            Toast.makeText(this, "Could not open " + name, Toast.LENGTH_SHORT).show();
        }
    }

    private static boolean isWebUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void open(String input) {
        BrowserTab tab = activeTab();
        if (tab == null || switching || !ready) return;
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
        loadInTab(tab, url);
    }

    private void hideKeyboard() {
        if (address == null) return;
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

    @RequiresApi(api = Build.VERSION_CODES.P)
    private void handleIntent(Intent intent) {
        if (intent == null || !ready) return;
        BrowserTab tab = activeTab();
        if (tab == null) tab = newTab(false);
        if (tab == null) return;
        boolean internal = intent.getComponent() != null && BrowserActivity.class.getName().equals(intent.getComponent().getClassName());
        String url = internal ? intent.getStringExtra(EXTRA_URL) : null;
        boolean blank = tab.start && !hasPage(tab);
        if (url != null && isWebUrl(url)) {
            closeSwitcher();
            if (!blank && tabs.full()) toast(BrowserTabs.MAX_TABS + " tabs are open, so the link opened in this tab");
            if (blank || tabs.full()) loadInTab(tab, url);
            else openInNewTab(url, true);
            return;
        }
        boolean focus = intent.getBooleanExtra(EXTRA_FOCUS, false) || ACTION_SEARCH.equals(intent.getAction());
        if (!focus) return;
        closeSwitcher();
        if (blank || tabs.full()) showActive();
        else newTab(false);
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
        if (startView == null) return;
        if (startColumn != null) {
            ViewGroup.LayoutParams params = startColumn.getLayoutParams();
            params.width = startWidth();
            startColumn.setLayoutParams(params);
        }
        renderPins();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (root == null || rendererLost) return;
        loadSettings();
        WebView web = activeWeb();
        if (web != null && !startShowing()) web.onResume();
        if (startShowing() && ready) renderPins();
        updateBar();
    }

    @Override
    protected void onPause() {
        WebView web = activeWeb();
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        BrowserTab tab = activeTab();
        if (tab == null) {
            finish();
            return;
        }
        BrowserTabs.Back action = BrowserTabs.back(switcherOpen(), address != null && address.hasFocus(), tab.start, hasPage(tab), tab.web != null && tab.web.canGoBack(), tab.fromStart, tabs.size());
        switch (action) {
            case CLOSE_SWITCHER:
                closeSwitcher();
                break;
            case HIDE_KEYBOARD:
                hideKeyboard();
                break;
            case WEB_BACK:
                tab.web.goBack();
                break;
            case SHOW_START:
                backToStart(tab);
                break;
            case CLOSE_TAB:
                closeTab(tab);
                break;
            default:
                finish();
        }
    }

    private void rendererGone() {
        if (rendererLost) return;
        rendererLost = true;
        ready = false;
        destroyAllWebs();
        if (art != null) {
            ViewGroup parent = (ViewGroup) art.getParent();
            if (parent != null) parent.removeView(art);
            art.destroy();
            art = null;
        }
        wipe(null, null);
        Toast.makeText(this, "A page crashed, so the browser closed", Toast.LENGTH_SHORT).show();
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
        if (!rendererLost && root != null) {
            for (BrowserTab tab : tabs.list()) if (tab.web != null) tab.web.stopLoading();
            wipe(art, null);
            destroyAllWebs();
            if (art != null) {
                ViewGroup parent = (ViewGroup) art.getParent();
                if (parent != null) parent.removeView(art);
                art.destroy();
                art = null;
            }
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
