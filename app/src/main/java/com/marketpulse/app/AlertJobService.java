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
import java.util.HashMap;
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
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    /* ---------- scheduling ---------- */

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
            if (title != null) {
                if (!"move".equals(type)) a.put("active", false);
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

    private static String fmt(double v) {
        return String.format(Locale.US, v >= 1 ? "%,.2f" : "%.4f", v);
    }

    /** Returns {price, previousClose} or null. */
    private static double[] quote(String sym) {
        String[] hosts = {"query1.finance.yahoo.com", "query2.finance.yahoo.com"};
        for (String h : hosts) {
            HttpURLConnection c = null;
            try {
                URL u = new URL("https://" + h + "/v8/finance/chart/" + URLEncoder.encode(sym, "UTF-8") + "?range=1d&interval=5m");
                c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36");
                if (c.getResponseCode() >= 400) continue;
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                JSONObject meta = new JSONObject(out.toString("UTF-8")).getJSONObject("chart")
                        .getJSONArray("result").getJSONObject(0).getJSONObject("meta");
                double price = meta.getDouble("regularMarketPrice");
                double prev = meta.has("previousClose") ? meta.getDouble("previousClose") : meta.optDouble("chartPreviousClose", 0);
                return new double[]{price, prev};
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
        }
        return null;
    }
}
