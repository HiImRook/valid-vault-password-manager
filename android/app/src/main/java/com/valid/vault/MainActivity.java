package com.valid.vault;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricVault.class);
        registerPlugin(NativeDownloader.class);
        registerPlugin(ShareTarget.class);
        registerPlugin(AutofillSetup.class);
        registerPlugin(BrowserBridge.class);
        registerPlugin(LaunchTarget.class);
        super.onCreate(savedInstanceState);
    }
}
