package com.valid.vault;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NativeDownloader")
public class NativeDownloader extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        if (filename == null || data == null) {
            call.reject("Missing filename or data");
            return;
        }

        try {
            Context context = getContext();
            byte[] bytes = data.getBytes(StandardCharsets.UTF_8);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri item = resolver.insert(collection, values);
                if (item == null) {
                    call.reject("Could not create file entry");
                    return;
                }

                OutputStream out = resolver.openOutputStream(item);
                if (out == null) {
                    call.reject("Could not open output stream");
                    return;
                }
                out.write(bytes);
                out.close();

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(item, values, null, null);

                JSObject ret = new JSObject();
                ret.put("uri", item.toString());
                call.resolve(ret);
            } else {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadsDir.exists()) downloadsDir.mkdirs();
                File outFile = new File(downloadsDir, filename);
                FileOutputStream fos = new FileOutputStream(outFile);
                fos.write(bytes);
                fos.close();

                JSObject ret = new JSObject();
                ret.put("uri", outFile.getAbsolutePath());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage());
        }
    }
}
