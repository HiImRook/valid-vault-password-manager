package com.valid.vault;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class IconWidgetProvider extends AppWidgetProvider {

    private static final int REQUEST_OPEN = 4301;

    protected int layoutId() {
        return R.layout.vv_widget_icon_night;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setAction(Intent.ACTION_MAIN);
        launch.addCategory(Intent.CATEGORY_LAUNCHER);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        PendingIntent open = PendingIntent.getActivity(context, REQUEST_OPEN, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), layoutId());
            views.setOnClickPendingIntent(R.id.vv_icon_root, open);
            manager.updateAppWidget(id, views);
        }
    }
}
