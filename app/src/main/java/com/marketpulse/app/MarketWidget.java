package com.marketpulse.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget: up to five watchlist prices with today's change.
 * The app writes the symbols and latest prices to SharedPreferences ("widget");
 * the background job refreshes the prices about every 15 minutes.
 */
public class MarketWidget extends AppWidgetProvider {

    private static final int[][] ROWS = {
            {R.id.row1, R.id.row1_sym, R.id.row1_price, R.id.row1_chg},
            {R.id.row2, R.id.row2_sym, R.id.row2_price, R.id.row2_chg},
            {R.id.row3, R.id.row3_sym, R.id.row3_price, R.id.row3_chg},
            {R.id.row4, R.id.row4_sym, R.id.row4_price, R.id.row4_chg},
            {R.id.row5, R.id.row5_sym, R.id.row5_price, R.id.row5_chg},
    };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        render(ctx, mgr, ids);
        AlertJobService.schedule(ctx, true);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { AlertJobService.refreshWidget(ctx.getApplicationContext()); } catch (Exception ignored) { }
            pr.finish();
        }).start();
    }

    @Override
    public void onEnabled(Context ctx) {
        AlertJobService.schedule(ctx, true);
    }

    static boolean exists(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        return mgr != null && mgr.getAppWidgetIds(new ComponentName(ctx, MarketWidget.class)).length > 0;
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, MarketWidget.class));
        if (ids.length > 0) render(ctx, mgr, ids);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int[] ids) {
        JSONObject data;
        try {
            data = new JSONObject(ctx.getSharedPreferences(AlertJobService.PREFS, Context.MODE_PRIVATE).getString("widget", "{}"));
        } catch (Exception e) {
            data = new JSONObject();
        }
        JSONArray rows = data.optJSONArray("rows");
        long t = data.optLong("t", 0);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_market);
            v.setTextViewText(R.id.w_time, t > 0 ? new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(t)) : "");
            int n = rows == null ? 0 : rows.length();
            v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
            for (int i = 0; i < ROWS.length; i++) {
                if (i >= n) { v.setViewVisibility(ROWS[i][0], View.GONE); continue; }
                JSONObject r = rows.optJSONObject(i);
                if (r == null) { v.setViewVisibility(ROWS[i][0], View.GONE); continue; }
                double c = r.optDouble("c", 0);
                v.setViewVisibility(ROWS[i][0], View.VISIBLE);
                v.setTextViewText(ROWS[i][1], r.optString("s"));
                v.setTextViewText(ROWS[i][2], r.optString("p"));
                v.setTextViewText(ROWS[i][3], String.format(Locale.US, "%s%.2f%%", c >= 0 ? "+" : "−", Math.abs(c)));
                v.setTextColor(ROWS[i][3], Color.parseColor(c >= 0 ? "#2fd17a" : "#ff4a3d"));
            }
            Intent open = new Intent(ctx, MainActivity.class);
            v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 1, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            mgr.updateAppWidget(id, v);
        }
    }
}
