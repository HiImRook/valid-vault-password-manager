package com.valid.vault;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

final class BrowserEmboss extends Drawable {

    private final Drawable highlight;
    private final Drawable shadow;
    private final Drawable main;
    private final float highlightShift;
    private final float shadowShift;
    private final int width;
    private final int height;

    BrowserEmboss(Context context, int res, int mainColor, int highlightColor, int shadowColor, float highlightShift, float shadowShift) {
        highlight = tinted(context, res, highlightColor);
        shadow = tinted(context, res, shadowColor);
        main = tinted(context, res, mainColor);
        this.highlightShift = highlightShift;
        this.shadowShift = shadowShift;
        int pad = (int) Math.ceil(Math.max(highlightShift, shadowShift));
        width = main.getIntrinsicWidth() + pad * 2;
        height = main.getIntrinsicHeight() + pad * 2;
    }

    private static Drawable tinted(Context context, int res, int color) {
        Drawable d = context.getDrawable(res).mutate();
        d.setColorFilter(new PorterDuffColorFilter(color, PorterDuff.Mode.SRC_IN));
        return d;
    }

    @Override
    protected void onBoundsChange(Rect bounds) {
        super.onBoundsChange(bounds);
        int w = main.getIntrinsicWidth();
        int h = main.getIntrinsicHeight();
        int l = bounds.left + (bounds.width() - w) / 2;
        int t = bounds.top + (bounds.height() - h) / 2;
        for (Drawable d : new Drawable[] { highlight, shadow, main }) d.setBounds(l, t, l + w, t + h);
    }

    @Override
    public void draw(Canvas canvas) {
        int save = canvas.save();
        canvas.translate(-highlightShift, -highlightShift);
        highlight.draw(canvas);
        canvas.restoreToCount(save);
        save = canvas.save();
        canvas.translate(shadowShift, shadowShift);
        shadow.draw(canvas);
        canvas.restoreToCount(save);
        main.draw(canvas);
    }

    @Override
    public int getIntrinsicWidth() {
        return width;
    }

    @Override
    public int getIntrinsicHeight() {
        return height;
    }

    @Override
    public void setAlpha(int alpha) {
        highlight.setAlpha(alpha);
        shadow.setAlpha(alpha);
        main.setAlpha(alpha);
        invalidateSelf();
    }

    @Override
    public void setColorFilter(ColorFilter filter) {
    }

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}
