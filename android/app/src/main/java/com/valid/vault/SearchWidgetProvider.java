package com.valid.vault;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class SearchWidgetProvider extends AppWidgetProvider {

    static final int REQUEST_SEARCH = 4101;
    private static final int REQUEST_BOOKMARKS = 4102;

    static PendingIntent searchPending(Context context) {
        Intent intent = BrowserActivity.openIntent(context, null, true);
        intent.setAction(BrowserActivity.ACTION_SEARCH);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, REQUEST_SEARCH, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        PendingIntent search = searchPending(context);
        PendingIntent bookmarks = LaunchTarget.tabPending(context, LaunchTarget.TAB_BOOKMARKS, REQUEST_BOOKMARKS);
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.vv_widget_search);
            views.setOnClickPendingIntent(R.id.vv_widget_search_root, search);
            views.setOnClickPendingIntent(R.id.vv_widget_bookmarks, bookmarks);
            manager.updateAppWidget(id, views);
        }
    }
}
