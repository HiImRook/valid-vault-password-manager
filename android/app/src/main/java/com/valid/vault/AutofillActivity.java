package com.valid.vault;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.annotation.RequiresApi;

import com.getcapacitor.BridgeActivity;

@RequiresApi(api = Build.VERSION_CODES.O)
public class AutofillActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricVault.class);
        registerPlugin(AutofillBridge.class);
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
    }
}
