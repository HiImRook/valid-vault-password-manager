package com.valid.vault;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricVault.class);
        registerPlugin(NativeDownloader.class);
        super.onCreate(savedInstanceState);
    }
}
