package com.marketpulse.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.TimeZone;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

/**
 * Runs about every 15 minutes (Android's minimum for periodic jobs), checks
 * the user's price alerts against Yahoo Finance and posts notifications.
 *
 * Alerts live in SharedPreferences ("alerts", a JSON array) and are written
 * by the UI through the JS bridge. Each alert:
 * {id, sym, name, type: "above"|"below"|"move", value, active, src, lastFired}
 */
public class AlertJobService extends JobService {

    static final String PREFS = "marketpulse";
    static final String CHANNEL = "alerts";
    static final int JOB_ID = 4201;
    private static final Object LOCK = new Object();

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(() -> {
            try { check(getApplicationContext()); } catch (Exception ignored) { }
            try { refreshWidget(getApplicationContext()); } catch (Exception ignored) { }
            try { digest(getApplicationContext()); } catch (Exception ignored) { }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    /* ---------- scheduling ---------- */

    /** Keep the periodic job only while something needs it: alerts, the widget or the digest. */
    static void reschedule(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean alerts = p.getString("alerts", "[]").contains("\"active\":true");
        boolean digest = false;
        try { digest = new JSONObject(p.getString("digest", "{}")).optBoolean("on", false); } catch (Exception ignored) { }
        schedule(ctx, alerts || digest || MarketWidget.exists(ctx));
    }

    static void schedule(Context ctx, boolean on) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!on) { js.cancel(JOB_ID); return; }
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, AlertJobService.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }

    static void ensureChannel(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Price alerts", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Price targets, big moves and wishlist buy levels");
            nm.createNotificationChannel(ch);
        }
    }

    static void notify(Context ctx, String title, String body) {
        ensureChannel(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("openAlerts", true);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try { nm.notify((int) (System.nanoTime() & 0x7fffffff), n); } catch (SecurityException ignored) { }
        logTriggered(ctx, title, body);
    }

    static void logTriggered(Context ctx, String title, String body) {
        synchronized (LOCK) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
            try {
                JSONArray log = new JSONArray(p.getString("triggered", "[]"));
                JSONObject e = new JSONObject();
                e.put("t", System.currentTimeMillis());
                e.put("title", title);
                e.put("body", body);
                JSONArray out = new JSONArray();
                out.put(e);
                for (int i = 0; i < log.length() && i < 49; i++) out.put(log.get(i));
                p.edit().putString("triggered", out.toString()).apply();
            } catch (Exception ignored) { }
        }
    }

    /* ---------- widget ---------- */

    /** Re-prices the symbols shown on the home-screen widget. */
    static void refreshWidget(Context ctx) throws Exception {
        if (!MarketWidget.exists(ctx)) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONObject data = new JSONObject(p.getString("widget", "{}"));
        JSONArray rows = data.optJSONArray("rows");
        if (rows == null || rows.length() == 0) return;
        JSONArray out = new JSONArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.getJSONObject(i);
            double[] q = quote(r.optString("sym", r.optString("s")));
            if (q != null) {
                r.put("p", fmt(q[0]));
                if (q[1] > 0) r.put("c", (q[0] / q[1] - 1) * 100);
            }
            out.put(r);
        }
        data.put("rows", out);
        data.put("t", System.currentTimeMillis());
        p.edit().putString("widget", data.toString()).apply();
        MarketWidget.refreshAll(ctx);
    }

    /* ---------- the check ---------- */

    static void check(Context ctx) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray alerts;
        synchronized (LOCK) { alerts = new JSONArray(p.getString("alerts", "[]")); }
        Map<String, double[]> prices = new HashMap<>();
        Map<String, double[][]> daily = new HashMap<>();
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean changed = false;

        for (int i = 0; i < alerts.length(); i++) {
            JSONObject a = alerts.getJSONObject(i);
            if (!a.optBoolean("active", true)) continue;
            String sym = a.getString("sym");
            if (!prices.containsKey(sym)) prices.put(sym, quote(sym));
            double[] q = prices.get(sym);
            if (q == null) continue;
            double price = q[0], prev = q[1], value = a.optDouble("value", Double.NaN);
            String type = a.optString("type"), name = a.optString("name", sym);
            String label = name.equals(sym) ? sym : name + " (" + sym + ")";
            String title = null, body = null;

            if ("above".equals(type) && price >= value) {
                title = label + " is above " + fmt(value);
                body = "Now " + fmt(price) + ". Your alert has been switched off; set a new one in MarketPulse.";
            } else if ("below".equals(type) && price <= value) {
                boolean wish = "wish".equals(a.optString("src"));
                title = wish ? label + " hit your buy target" : label + " is below " + fmt(value);
                body = "Now " + fmt(price) + (wish ? " (target " + fmt(value) + "). Check the signals before you act." : ". Your alert has been switched off.");
            } else if ("move".equals(type) && prev > 0 && !today.equals(a.optString("lastFired"))) {
                double pct = (price / prev - 1) * 100;
                if (Math.abs(pct) >= value) {
                    title = label + (pct > 0 ? " up " : " down ") + String.format(Locale.US, "%.1f%%", Math.abs(pct)) + " today";
                    body = "Now " + fmt(price) + " vs previous close " + fmt(prev) + ".";
                    a.put("lastFired", today);
                    changed = true;
                }
            }
            if (title == null && TECH.contains(type) && !today.equals(a.optString("lastFired"))) {
                if (!daily.containsKey(sym)) daily.put(sym, dailyBars(sym));
                String what = tech(type, daily.get(sym));
                if (what != null) {
                    title = label + " " + what;
                    body = "Now " + fmt(price) + ". Check the chart and news in MarketPulse before acting.";
                    a.put("lastFired", today);
                }
            }
            if (title != null) {
                if (!"move".equals(type) && !TECH.contains(type)) a.put("active", false);
                a.put("firedAt", System.currentTimeMillis());
                changed = true;
                notify(ctx, title, body);
            }
        }
        if (changed) {
            synchronized (LOCK) {
                // Merge onto the latest copy so edits made in the app meanwhile are kept.
                JSONArray latest = new JSONArray(p.getString("alerts", "[]"));
                Map<String, JSONObject> byId = new HashMap<>();
                for (int i = 0; i < alerts.length(); i++) byId.put(alerts.getJSONObject(i).optString("id"), alerts.getJSONObject(i));
                for (int i = 0; i < latest.length(); i++) {
                    JSONObject l = latest.getJSONObject(i), mine = byId.get(l.optString("id"));
                    if (mine == null) continue;
                    if (mine.has("firedAt")) { l.put("firedAt", mine.get("firedAt")); l.put("active", mine.optBoolean("active", true)); }
                    if (mine.has("lastFired")) l.put("lastFired", mine.get("lastFired"));
                }
                p.edit().putString("alerts", latest.toString()).apply();
            }
        }
    }

    /* ---------- technical alerts (evaluated on daily bars) ---------- */

    static final List<String> TECH = java.util.Arrays.asList("brk20", "rsi70", "rsi30", "golden", "death", "vol2");

    /** {closes, highs, volumes} for about one year of daily bars, or null. */
    private static double[][] dailyBars(String sym) {
        try {
            JSONObject res = new JSONObject(get("/v8/finance/chart/" + URLEncoder.encode(sym, "UTF-8") + "?range=1y&interval=1d"))
                    .getJSONObject("chart").getJSONArray("result").getJSONObject(0);
            JSONObject q = res.getJSONObject("indicators").getJSONArray("quote").getJSONObject(0);
            JSONArray c = q.getJSONArray("close"), h = q.getJSONArray("high"), v = q.getJSONArray("volume");
            List<double[]> rows = new ArrayList<>();
            for (int i = 0; i < c.length(); i++) {
                if (c.isNull(i)) continue;
                rows.add(new double[]{c.getDouble(i), h.isNull(i) ? c.getDouble(i) : h.getDouble(i), v.isNull(i) ? 0 : v.getDouble(i)});
            }
            double[][] out = new double[3][rows.size()];
            for (int i = 0; i < rows.size(); i++) { out[0][i] = rows.get(i)[0]; out[1][i] = rows.get(i)[1]; out[2][i] = rows.get(i)[2]; }
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private static double sma(double[] a, int end, int k) {
        if (end - k + 1 < 0) return Double.NaN;
        double s = 0;
        for (int i = end - k + 1; i <= end; i++) s += a[i];
        return s / k;
    }

    private static double rsi(double[] c, int end) {
        int k = 14;
        if (end <= k) return Double.NaN;
        double g = 0, l = 0;
        for (int i = 1; i <= k; i++) { double d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
        g /= k; l /= k;
        for (int i = k + 1; i <= end; i++) { double d = c[i] - c[i - 1]; g = (g * (k - 1) + Math.max(d, 0)) / k; l = (l * (k - 1) + Math.max(-d, 0)) / k; }
        return l == 0 ? 100 : 100 - 100 / (1 + g / l);
    }

    private static double maxHigh(double[] h, int from, int to) {
        double m = -Double.MAX_VALUE;
        for (int i = Math.max(0, from); i <= to; i++) m = Math.max(m, h[i]);
        return m;
    }

    /** A short description if the event happened on the latest bar (and not on the one before), else null. */
    static String tech(String type, double[][] d) {
        if (d == null) return null;
        double[] c = d[0], h = d[1], v = d[2];
        int n = c.length, t = n - 1;
        if (n < 30) return null;
        switch (type) {
            case "brk20":
                return c[t] > maxHigh(h, t - 20, t - 1) && !(c[t - 1] > maxHigh(h, t - 21, t - 2)) ? "broke above its 20-day high" : null;
            case "rsi70": {
                double a = rsi(c, t), b = rsi(c, t - 1);
                return a >= 70 && b < 70 ? String.format(Locale.US, "RSI crossed above 70 (%.0f, overbought)", a) : null;
            }
            case "rsi30": {
                double a = rsi(c, t), b = rsi(c, t - 1);
                return a <= 30 && b > 30 ? String.format(Locale.US, "RSI crossed below 30 (%.0f, oversold)", a) : null;
            }
            case "golden":
            case "death": {
                if (n < 202) return null;
                double f = sma(c, t, 50), s = sma(c, t, 200), f1 = sma(c, t - 1, 50), s1 = sma(c, t - 1, 200);
                if ("golden".equals(type)) return f > s && f1 <= s1 ? "golden cross: 50-day average crossed above the 200-day" : null;
                return f < s && f1 >= s1 ? "death cross: 50-day average crossed below the 200-day" : null;
            }
            case "vol2": {
                double avg = sma(v, t - 1, 20);
                return avg > 0 && v[t] >= 2 * avg ? String.format(Locale.US, "volume spike: %.1f× its 20-day average", v[t] / avg) : null;
            }
        }
        return null;
    }

    /* ---------- market-open digest ---------- */

    private static final String[][] MARKETS = {
            // key, index, zone, open hour, open minute, label
            {"SGX", "^STI", "Asia/Singapore", "9", "0", "SGX"},
            {"NSE", "^NSEI", "Asia/Kolkata", "9", "15", "NSE"},
            {"NASDAQ", "^IXIC", "America/New_York", "9", "30", "NASDAQ"},
    };

    static void digest(Context ctx) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONObject cfg = new JSONObject(p.getString("digest", "{}"));
        if (!cfg.optBoolean("on", false)) return;
        JSONArray mk = cfg.optJSONArray("markets");
        JSONObject syms = cfg.optJSONObject("syms");
        JSONArray events = cfg.optJSONArray("events");
        for (String[] m : MARKETS) {
            boolean wanted = false;
            for (int i = 0; mk != null && i < mk.length(); i++) if (m[0].equals(mk.optString(i))) wanted = true;
            if (!wanted) continue;
            TimeZone tz = TimeZone.getTimeZone(m[2]);
            Calendar now = Calendar.getInstance(tz);
            int dow = now.get(Calendar.DAY_OF_WEEK);
            if (dow == Calendar.SATURDAY || dow == Calendar.SUNDAY) continue;
            int mins = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            int open = Integer.parseInt(m[3]) * 60 + Integer.parseInt(m[4]);
            if (mins < open + 5 || mins > open + 150) continue;
            SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            df.setTimeZone(tz);
            String today = df.format(now.getTime());
            String sentKey = "digestSent_" + m[0];
            if (today.equals(p.getString(sentKey, ""))) continue;
            double[] idx = quoteFull(m[1]);
            if (idx == null) continue;
            p.edit().putString(sentKey, today).apply();
            if (idx[2] > 0 && !today.equals(df.format(new Date((long) idx[2] * 1000)))) continue; // holiday: no trading today
            StringBuilder body = new StringBuilder();
            JSONArray list = syms == null ? null : syms.optJSONArray(m[0]);
            List<String[]> movers = new ArrayList<>();
            for (int i = 0; list != null && i < list.length() && i < 12; i++) {
                String s = list.optString(i);
                double[] q = quote(s);
                if (q != null && q[1] > 0) movers.add(new String[]{s.replaceAll("\\.(SI|NS)$", ""), String.valueOf((q[0] / q[1] - 1) * 100)});
            }
            movers.sort((a, b) -> Double.compare(Math.abs(Double.parseDouble(b[1])), Math.abs(Double.parseDouble(a[1]))));
            if (!movers.isEmpty()) {
                body.append("Your stocks: ");
                for (int i = 0; i < movers.size() && i < 3; i++) {
                    double c = Double.parseDouble(movers.get(i)[1]);
                    body.append(i > 0 ? ", " : "").append(movers.get(i)[0]).append(String.format(Locale.US, " %s%.1f%%", c >= 0 ? "+" : "−", Math.abs(c)));
                }
                body.append(". ");
            }
            List<String> evToday = new ArrayList<>();
            for (int i = 0; events != null && i < events.length(); i++) {
                JSONObject e = events.optJSONObject(i);
                if (e != null && today.equals(e.optString("d")) && m[0].equals(e.optString("m"))) evToday.add(e.optString("s") + " " + e.optString("k").toLowerCase(Locale.US));
            }
            if (!evToday.isEmpty()) body.append("Today: ").append(android.text.TextUtils.join(", ", evToday)).append(". ");
            body.append("Open MarketPulse for breakouts and news.");
            double chg = idx[1] > 0 ? (idx[0] / idx[1] - 1) * 100 : 0;
            notify(ctx, m[5] + " is open · " + (m[1].equals("^STI") ? "STI" : m[1].equals("^NSEI") ? "Nifty 50" : "Nasdaq")
                    + String.format(Locale.US, " %s%.2f%%", chg >= 0 ? "+" : "−", Math.abs(chg)), body.toString());
        }
    }

    private static String fmt(double v) {
        return String.format(Locale.US, v >= 1 ? "%,.2f" : "%.4f", v);
    }

    private static String get(String path) throws Exception {
        String[] hosts = {"query1.finance.yahoo.com", "query2.finance.yahoo.com"};
        Exception last = null;
        for (String h : hosts) {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL("https://" + h + path).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36");
                if (c.getResponseCode() >= 400) { last = new Exception("HTTP " + c.getResponseCode()); continue; }
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                return out.toString("UTF-8");
            } catch (Exception e) {
                last = e;
            } finally {
                if (c != null) c.disconnect();
            }
        }
        throw last != null ? last : new Exception("No data");
    }

    /** {price, previousClose, regularMarketTime} or null. */
    private static double[] quoteFull(String sym) {
        try {
            JSONObject meta = new JSONObject(get("/v8/finance/chart/" + URLEncoder.encode(sym, "UTF-8") + "?range=1d&interval=5m"))
                    .getJSONObject("chart").getJSONArray("result").getJSONObject(0).getJSONObject("meta");
            double price = meta.getDouble("regularMarketPrice");
            double prev = meta.has("previousClose") ? meta.getDouble("previousClose") : meta.optDouble("chartPreviousClose", 0);
            return new double[]{price, prev, meta.optDouble("regularMarketTime", 0)};
        } catch (Exception e) {
            return null;
        }
    }

    /** Returns {price, previousClose} or null. */
    private static double[] quote(String sym) {
        double[] q = quoteFull(sym);
        if (q != null) return new double[]{q[0], q[1]};
        return null;
    }
}
