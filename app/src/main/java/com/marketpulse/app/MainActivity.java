package com.marketpulse.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hosts the UI (assets/index.html) in a WebView and provides a native bridge:
 *  - HTTPS requests to an allow-list of hosts (no browser CORS limits),
 *  - fingerprint / device-PIN app lock,
 *  - price alerts checked in the background with notifications,
 *  - opening links in the phone's browser.
 */
public class MainActivity extends Activity {

    private static final String[] ALLOWED_HOSTS = {
            "query1.finance.yahoo.com",
            "query2.finance.yahoo.com",
            "news.google.com",
            "api.anthropic.com"
    };
    private static final int REQ_CREDENTIAL = 11;
    private static final int REQ_NOTIFY = 12;
    private static final int REQ_EXPORT = 13;
    private static final int REQ_IMPORT = 14;
    private static final long RELOCK_AFTER_MS = 30_000;

    private WebView web;
    private View lockView;
    private TextView lockMsg;
    private SharedPreferences prefs;
    private final ExecutorService pool = Executors.newFixedThreadPool(8);
    private final Handler main = new Handler(Looper.getMainLooper());

    private boolean authInProgress = false, pageReady = false, pendingOpenAlerts = false;
    private volatile String yahooCrumb = null;
    private String pendingExport = null;
    private boolean pickerOpen = false;
    private long backgroundAt = 0;
    private Runnable authOk, authFail;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(AlertJobService.PREFS, MODE_PRIVATE);
        if (CookieHandler.getDefault() == null) CookieHandler.setDefault(new CookieManager(null, CookiePolicy.ACCEPT_ALL));
        AlertJobService.ensureChannel(this);
        setBars(true);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#16191c"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if ("https".equals(u.getScheme())) { openExternal(u.toString()); return true; }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingOpenAlerts) { pendingOpenAlerts = false; js("window.openAlerts && window.openAlerts()"); }
            }
        });
        // android_asset URLs stay readable even with file access turned off.
        web.loadUrl("file:///android_asset/index.html");
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        lockView = buildLockView();
        root.addView(lockView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        pendingOpenAlerts = getIntent() != null && getIntent().getBooleanExtra("openAlerts", false);
        if (lockOn()) lockNow(); else lockView.setVisibility(View.GONE);
        AlertJobService.reschedule(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("openAlerts", false)) {
            if (pageReady) js("window.openAlerts && window.openAlerts()"); else pendingOpenAlerts = true;
        }
    }

    /* ---------- lock ---------- */

    private boolean lockOn() { return prefs.getBoolean("lock", false); }

    private View buildLockView() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setGravity(Gravity.CENTER);
        v.setBackgroundColor(Color.parseColor("#16191c"));
        v.setPadding(64, 64, 64, 64);
        v.setClickable(true);
        TextView dot = new TextView(this);
        dot.setText("●");
        dot.setTextColor(Color.parseColor("#e8251a"));
        dot.setTextSize(28);
        dot.setGravity(Gravity.CENTER);
        TextView title = new TextView(this);
        title.setText("MarketPulse is locked");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        lockMsg = new TextView(this);
        lockMsg.setText("Use your fingerprint or screen lock to continue.");
        lockMsg.setTextColor(Color.parseColor("#9aa4ac"));
        lockMsg.setTextSize(15);
        lockMsg.setGravity(Gravity.CENTER);
        lockMsg.setPadding(0, 16, 0, 40);
        Button b = new Button(this);
        b.setText("Unlock");
        b.setAllCaps(false);
        b.setOnClickListener(x -> unlock());
        v.addView(dot);
        v.addView(title);
        v.addView(lockMsg);
        v.addView(b);
        return v;
    }

    private void lockNow() {
        lockView.setVisibility(View.VISIBLE);
        web.setVisibility(View.INVISIBLE);
        main.postDelayed(this::unlock, 250);
    }

    private void unlock() {
        if (authInProgress) return;
        authenticate("Unlock MarketPulse", () -> {
            lockView.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
        }, () -> lockMsg.setText("Not unlocked. Tap Unlock to try again."));
    }

    private boolean deviceSecure() {
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        return km != null && km.isDeviceSecure();
    }

    /** Fingerprint (or face) with the device PIN/pattern/password as fallback. */
    @SuppressWarnings("deprecation")
    private void authenticate(String title, Runnable ok, Runnable fail) {
        authInProgress = true;
        authOk = ok;
        authFail = fail;
        if (Build.VERSION.SDK_INT >= 28) {
            BiometricPrompt.Builder b = new BiometricPrompt.Builder(this)
                    .setTitle(title)
                    .setSubtitle("Touch the fingerprint sensor");
            if (Build.VERSION.SDK_INT >= 30) {
                b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK
                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            } else if (Build.VERSION.SDK_INT >= 29) {
                b.setDeviceCredentialAllowed(true);
            } else {
                b.setNegativeButton("Use PIN", getMainExecutor(), (d, w) -> credentialFallback(title));
            }
            try {
                b.build().authenticate(new CancellationSignal(), getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { authDone(true); }

                    @Override
                    public void onAuthenticationError(int code, CharSequence msg) {
                        if (code == BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT
                                || code == BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE
                                || code == BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS) {
                            credentialFallback(title);
                        } else {
                            authDone(false);
                        }
                    }
                });
            } catch (Exception e) {
                credentialFallback(title);
            }
        } else {
            credentialFallback(title);
        }
    }

    @SuppressWarnings("deprecation")
    private void credentialFallback(String title) {
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (km != null && km.isDeviceSecure()) {
            Intent i = km.createConfirmDeviceCredentialIntent(title, "Enter your screen lock");
            if (i != null) { startActivityForResult(i, REQ_CREDENTIAL); return; }
        }
        // The phone has no screen lock, so nothing can verify the user: turn the app lock off.
        prefs.edit().putBoolean("lock", false).apply();
        js("window.onLockChanged && window.onLockChanged(false, 'Set up a fingerprint or screen lock on your phone first.')");
        authDone(true);
    }

    private void authDone(boolean ok) {
        authInProgress = false;
        Runnable r = ok ? authOk : authFail;
        authOk = authFail = null;
        if (r != null) r.run();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CREDENTIAL) authDone(resultCode == RESULT_OK);
        if (requestCode == REQ_EXPORT || requestCode == REQ_IMPORT) {
            pickerOpen = false;
            final Uri uri = data != null ? data.getData() : null;
            if (resultCode != RESULT_OK || uri == null) {
                pendingExport = null;
                js(requestCode == REQ_EXPORT ? "window.onExportDone && window.onExportDone(false, 'cancelled')" : "window.onImportData && window.onImportData(null)");
                return;
            }
            if (requestCode == REQ_EXPORT) {
                final String text = pendingExport;
                pendingExport = null;
                pool.execute(() -> {
                    try (OutputStream os = getContentResolver().openOutputStream(uri, "wt")) {
                        os.write(text.getBytes(StandardCharsets.UTF_8));
                        js("window.onExportDone && window.onExportDone(true)");
                    } catch (Exception e) {
                        js("window.onExportDone && window.onExportDone(false, " + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                    }
                });
            } else {
                pool.execute(() -> {
                    try (InputStream in = getContentResolver().openInputStream(uri)) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            if (out.size() > 8 * 1024 * 1024) throw new Exception("File too large");
                        }
                        js("window.onImportData && window.onImportData(" + JSONObject.quote(out.toString("UTF-8")) + ")");
                    } catch (Exception e) {
                        js("window.onImportData && window.onImportData(null, " + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                    }
                });
            }
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!authInProgress && !pickerOpen) backgroundAt = System.currentTimeMillis();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (lockOn() && !authInProgress && backgroundAt > 0 && System.currentTimeMillis() - backgroundAt > RELOCK_AFTER_MS) {
            lockNow();
        }
        backgroundAt = 0;
    }

    /* ---------- misc ---------- */

    private void setBars(boolean dark) {
        int c = Color.parseColor(dark ? "#16191c" : "#d5dbe0");
        getWindow().setStatusBarColor(c);
        getWindow().setNavigationBarColor(c);
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        if (dark) flags &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    private void js(String code) {
        main.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
    }

    @Override
    public void onBackPressed() {
        if (lockView.getVisibility() == View.VISIBLE) { super.onBackPressed(); return; }
        web.evaluateJavascript("window.handleBack && window.handleBack()", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onAppResume && window.onAppResume()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_NOTIFY) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            js("window.onNotifyPermission && window.onNotifyPermission(" + ok + ")");
        }
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /* ---------- networking ---------- */

    private static boolean allowed(URL u) {
        if (!"https".equals(u.getProtocol())) return false;
        for (String h : ALLOWED_HOSTS) if (h.equalsIgnoreCase(u.getHost())) return true;
        return false;
    }

    private void deliver(String id, boolean ok, int status, String body) {
        js("window.__nativeResolve(" + JSONObject.quote(id) + "," + ok + "," + status + ","
                + JSONObject.quote(body == null ? "" : body) + ")");
    }

    private void doRequest(String id, String method, String url, String headersJson, String body) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(url);
            if (!allowed(u)) { deliver(id, false, 0, "Host not allowed"); return; }
            boolean ai = "api.anthropic.com".equalsIgnoreCase(u.getHost());
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(ai ? 180000 : 20000);
            c.setRequestMethod("POST".equals(method) ? "POST" : "GET");
            c.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36");
            c.setRequestProperty("Accept", "application/json, application/rss+xml, text/xml, */*");
            if (headersJson != null && !headersJson.isEmpty()) {
                JSONObject h = new JSONObject(headersJson);
                Iterator<String> keys = h.keys();
                while (keys.hasNext()) { String k = keys.next(); c.setRequestProperty(k, h.getString(k)); }
            }
            if ("POST".equals(method) && body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(bytes.length);
                OutputStream os = c.getOutputStream();
                os.write(bytes);
                os.close();
            }
            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            String text = "";
            if (in != null) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                text = out.toString("UTF-8");
            }
            deliver(id, code < 400, code, text);
        } catch (Exception e) {
            deliver(id, false, 0, String.valueOf(e.getMessage()));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /* ---------- Yahoo quoteSummary (earnings dates, dividends, valuation) ---------- */

    private String plainGet(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36");
            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            if (in == null) return "";
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            if (code >= 400) throw new Exception("HTTP " + code);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private synchronized String crumb(boolean fresh) throws Exception {
        if (yahooCrumb != null && !fresh) return yahooCrumb;
        try { plainGet("https://fc.yahoo.com"); } catch (Exception ignored) { } // sets the session cookie; a 404 is normal
        String c = plainGet("https://query1.finance.yahoo.com/v1/test/getcrumb").trim();
        if (c.isEmpty() || c.contains("<")) throw new Exception("No crumb");
        yahooCrumb = c;
        return c;
    }

    private void quoteSummary(String id, String sym, String modules) {
        try {
            String mods = modules.replaceAll("[^A-Za-z,]", "");
            for (int attempt = 0; attempt < 2; attempt++) {
                String cr = crumb(attempt > 0);
                try {
                    String body = plainGet("https://query2.finance.yahoo.com/v10/finance/quoteSummary/"
                            + URLEncoder.encode(sym, "UTF-8") + "?modules=" + mods + "&crumb=" + URLEncoder.encode(cr, "UTF-8"));
                    deliver(id, true, 200, body);
                    return;
                } catch (Exception e) {
                    if (attempt > 0) throw e;
                }
            }
        } catch (Exception e) {
            deliver(id, false, 0, String.valueOf(e.getMessage()));
        }
    }

    /* ---------- bridge ---------- */

    private class Bridge {
        @JavascriptInterface
        public void fetch(final String id, final String url) {
            pool.execute(() -> doRequest(id, "GET", url, null, null));
        }

        @JavascriptInterface
        public void request(final String id, final String method, final String url, final String headersJson, final String body) {
            pool.execute(() -> doRequest(id, method, url, headersJson, body));
        }

        /* backup & restore through the Android file picker */
        @JavascriptInterface
        public void exportData(final String filename, final String json) {
            main.post(() -> {
                pendingExport = json;
                pickerOpen = true;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json").putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(i, REQ_EXPORT); } catch (Exception e) { pickerOpen = false; js("window.onExportDone && window.onExportDone(false, 'No file picker on this phone')"); }
            });
        }

        @JavascriptInterface
        public void importData() {
            main.post(() -> {
                pickerOpen = true;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try { startActivityForResult(i, REQ_IMPORT); } catch (Exception e) { pickerOpen = false; js("window.onImportData && window.onImportData(null, 'No file picker on this phone')"); }
            });
        }

        /* version + bundled text files (the changelog) */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public String appVersion() {
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                JSONObject o = new JSONObject();
                o.put("name", pi.versionName);
                o.put("code", code);
                o.put("updated", pi.lastUpdateTime);
                o.put("installed", pi.firstInstallTime);
                o.put("android", Build.VERSION.RELEASE);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public String readAsset(String name) {
            if (!"CHANGELOG.md".equals(name)) return null;
            try (InputStream in = getAssets().open(name)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return out.toString("UTF-8");
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public void setDigest(String json) {
            prefs.edit().putString("digest", json == null ? "{}" : json).apply();
            AlertJobService.reschedule(MainActivity.this);
        }

        @JavascriptInterface
        public void yahooSummary(final String id, final String sym, final String modules) {
            pool.execute(() -> quoteSummary(id, sym, modules));
        }

        @JavascriptInterface
        public void setWidgetData(String json) {
            prefs.edit().putString("widget", json == null ? "{}" : json).apply();
            MarketWidget.refreshAll(getApplicationContext());
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url != null && url.startsWith("https://")) main.post(() -> openExternal(url));
        }

        /* lock */
        @JavascriptInterface
        public boolean lockAvailable() { return deviceSecure(); }

        @JavascriptInterface
        public boolean isLockOn() { return lockOn(); }

        @JavascriptInterface
        public void setLock(final boolean on) {
            main.post(() -> {
                if (!on) {
                    authenticate("Turn off app lock", () -> {
                        prefs.edit().putBoolean("lock", false).apply();
                        js("window.onLockChanged && window.onLockChanged(false)");
                    }, () -> js("window.onLockChanged && window.onLockChanged(true)"));
                    return;
                }
                if (!deviceSecure()) {
                    js("window.onLockChanged && window.onLockChanged(false, 'Set up a fingerprint or screen lock on your phone first.')");
                    return;
                }
                authenticate("Turn on app lock", () -> {
                    prefs.edit().putBoolean("lock", true).apply();
                    js("window.onLockChanged && window.onLockChanged(true)");
                }, () -> js("window.onLockChanged && window.onLockChanged(false)"));
            });
        }

        /* theme */
        @JavascriptInterface
        public void setDarkBars(final boolean dark) { main.post(() -> setBars(dark)); }

        /* alerts & notifications */
        @JavascriptInterface
        public String getAlerts() { return prefs.getString("alerts", "[]"); }

        @JavascriptInterface
        public void saveAlerts(String json) {
            prefs.edit().putString("alerts", json == null ? "[]" : json).apply();
            AlertJobService.reschedule(MainActivity.this);
        }

        @JavascriptInterface
        public String getTriggered() { return prefs.getString("triggered", "[]"); }

        @JavascriptInterface
        public void clearTriggered() { prefs.edit().putString("triggered", "[]").apply(); }

        @JavascriptInterface
        public void checkAlertsNow() {
            pool.execute(() -> {
                try { AlertJobService.check(getApplicationContext()); } catch (Exception ignored) { }
                js("window.onAlertsChecked && window.onAlertsChecked()");
            });
        }

        @JavascriptInterface
        public void notify(String title, String body) {
            AlertJobService.notify(getApplicationContext(), title, body);
        }

        @JavascriptInterface
        public boolean notificationsAllowed() {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            return nm != null && nm.areNotificationsEnabled();
        }

        @JavascriptInterface
        public void requestNotifications() {
            main.post(() -> {
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                } else {
                    js("window.onNotifyPermission && window.onNotifyPermission(" + notificationsAllowed() + ")");
                }
            });
        }
    }
}
