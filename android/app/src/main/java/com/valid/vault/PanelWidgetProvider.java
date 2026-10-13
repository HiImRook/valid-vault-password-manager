package com.valid.vault;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

public class PanelWidgetProvider extends AppWidgetProvider {

    private static final int REQUEST_BOOKMARKS = 4201;
    private static final int REQUEST_LOGINS = 4202;
    private static final int REQUEST_WALLETS = 4203;
    private static final int REQUEST_PERSONAL = 4204;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.vv_widget_panel);
            views.setOnClickPendingIntent(R.id.vv_panel_search, SearchWidgetProvider.searchPending(context));
            views.setOnClickPendingIntent(R.id.vv_panel_bookmarks, LaunchTarget.tabPending(context, LaunchTarget.TAB_BOOKMARKS, REQUEST_BOOKMARKS));
            views.setOnClickPendingIntent(R.id.vv_panel_logins, LaunchTarget.tabPending(context, LaunchTarget.TAB_LOGINS, REQUEST_LOGINS));
            views.setOnClickPendingIntent(R.id.vv_panel_wallets, LaunchTarget.tabPending(context, LaunchTarget.TAB_WALLETS, REQUEST_WALLETS));
            views.setOnClickPendingIntent(R.id.vv_panel_personal, LaunchTarget.tabPending(context, LaunchTarget.TAB_PERSONAL, REQUEST_PERSONAL));
            manager.updateAppWidget(id, views);
        }
    }
}
