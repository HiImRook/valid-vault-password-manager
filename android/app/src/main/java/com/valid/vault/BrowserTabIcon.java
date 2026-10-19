package com.valid.vault;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

final class BrowserTabIcon extends Drawable {

    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path outline = new Path();
    private final Path fold = new Path();
    private final RectF corner = new RectF();
    private final float radius;
    private final float ear;

    BrowserTabIcon(int fillColor, int strokeColor, float strokeWidth, float radius, float ear) {
        this.radius = radius;
        this.ear = ear;
        fill.setStyle(Paint.Style.FILL);
        fill.setColor(fillColor);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setColor(strokeColor);
        stroke.setStrokeWidth(strokeWidth);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        stroke.setStrokeCap(Paint.Cap.ROUND);
    }

    @Override
    protected void onBoundsChange(Rect bounds) {
        super.onBoundsChange(bounds);
        float inset = stroke.getStrokeWidth() / 2f;
        float l = bounds.left + inset;
        float t = bounds.top + inset;
        float r = bounds.right - inset;
        float b = bounds.bottom - inset;
        float d = radius * 2f;
        outline.reset();
        outline.moveTo(l + radius, t);
        outline.lineTo(r - ear, t);
        outline.lineTo(r, t + ear);
        outline.lineTo(r, b - radius);
        corner.set(r - d, b - d, r, b);
        outline.arcTo(corner, 0f, 90f, false);
        outline.lineTo(l + radius, b);
        corner.set(l, b - d, l + d, b);
        outline.arcTo(corner, 90f, 90f, false);
        outline.lineTo(l, t + radius);
        corner.set(l, t, l + d, t + d);
        outline.arcTo(corner, 180f, 90f, false);
        outline.close();
        fold.reset();
        fold.moveTo(r - ear, t);
        fold.lineTo(r - ear, t + ear);
        fold.lineTo(r, t + ear);
    }

    @Override
    public void draw(Canvas canvas) {
        canvas.drawPath(outline, fill);
        canvas.drawPath(outline, stroke);
        canvas.drawPath(fold, stroke);
    }

    @Override
    public void setAlpha(int alpha) {
        fill.setAlpha(alpha);
        stroke.setAlpha(alpha);
        invalidateSelf();
    }

    @Override
    public void setColorFilter(ColorFilter filter) {
        stroke.setColorFilter(filter);
        invalidateSelf();
    }

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}
