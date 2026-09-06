package com.valid.vault;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import android.util.Base64;

@CapacitorPlugin(name = "BiometricVault")
public class BiometricVault extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "valid_vault_biometric_key";
    private static final int GCM_TAG_BITS = 128;

    // ---- Availability ----
    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        int result = bm.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
            | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        JSObject ret = new JSObject();
        ret.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("code", result);
        call.resolve(ret);
    }

    // ---- Enroll: encrypt master key bytes under a fresh biometric-gated Keystore key ----
    @PluginMethod
    public void enroll(final PluginCall call) {
        final String masterKeyB64 = call.getString("masterKey");
        if (masterKeyB64 == null) { call.reject("Missing masterKey"); return; }

        try {
            SecretKey key = generateKey(); // fresh key, replaces any old one
            final Cipher cipher = Cipher.getInstance(
                KeyProperties.KEY_ALGORITHM_AES + "/" + KeyProperties.BLOCK_MODE_GCM + "/" + KeyProperties.ENCRYPTION_PADDING_NONE);
            cipher.init(Cipher.ENCRYPT_MODE, key);

            authenticate(call, cipher, new AuthCallback() {
                @Override public void onSuccess(Cipher authedCipher) {
                    try {
                        byte[] plain = Base64.decode(masterKeyB64, Base64.NO_WRAP);
                        byte[] ct = authedCipher.doFinal(plain);
                        byte[] iv = authedCipher.getIV();
                        JSObject ret = new JSObject();
                        ret.put("wrapped", Base64.encodeToString(ct, Base64.NO_WRAP));
                        ret.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Encrypt failed: " + e.getMessage());
                    }
                }
                @Override public void onError(String msg) { call.reject(msg); }
            });
        } catch (Exception e) {
            call.reject("Enroll setup failed: " + e.getMessage());
        }
    }

    // ---- Unlock: decrypt master key bytes after biometric ----
    @PluginMethod
    public void unlock(final PluginCall call) {
        final String wrappedB64 = call.getString("wrapped");
        final String ivB64 = call.getString("iv");
        if (wrappedB64 == null || ivB64 == null) { call.reject("Missing wrapped or iv"); return; }

        try {
            SecretKey key = getKey();
            if (key == null) { call.reject("No biometric key enrolled"); return; }
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            final Cipher cipher = Cipher.getInstance(
                KeyProperties.KEY_ALGORITHM_AES + "/" + KeyProperties.BLOCK_MODE_GCM + "/" + KeyProperties.ENCRYPTION_PADDING_NONE);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));

            authenticate(call, cipher, new AuthCallback() {
                @Override public void onSuccess(Cipher authedCipher) {
                    try {
                        byte[] ct = Base64.decode(wrappedB64, Base64.NO_WRAP);
                        byte[] plain = authedCipher.doFinal(ct);
                        JSObject ret = new JSObject();
                        ret.put("masterKey", Base64.encodeToString(plain, Base64.NO_WRAP));
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Decrypt failed: " + e.getMessage());
                    }
                }
                @Override public void onError(String msg) { call.reject(msg); }
            });
        } catch (Exception e) {
            call.reject("Unlock setup failed: " + e.getMessage());
        }
    }

    // ---- Remove enrolled key ----
    @PluginMethod
    public void remove(PluginCall call) {
        try {
            KeyStore ks = KeyStore.getInstance(KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS);
            call.resolve();
        } catch (Exception e) {
            call.reject("Remove failed: " + e.getMessage());
        }
    }

    // ---- helpers ----
    private interface AuthCallback {
        void onSuccess(Cipher cipher);
        void onError(String msg);
    }

    private void authenticate(PluginCall call, Cipher cipher, final AuthCallback cb) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) { cb.onError("No activity"); return; }
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                Executor executor = ContextCompat.getMainExecutor(getContext());
                BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            cb.onSuccess(result.getCryptoObject().getCipher());
                        }
                        @Override public void onAuthenticationError(int errorCode, CharSequence errString) {
                            cb.onError("Biometric error: " + errString);
                        }
                        @Override public void onAuthenticationFailed() {
                            // fired on a non-match; prompt stays open, do not reject here
                        }
                    });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Valid Vault")
                    .setSubtitle("Unlock with fingerprint or device PIN")
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG
                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build();
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            }
        });
    }

    private SecretKey generateKey() throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            builder.setUserAuthenticationParameters(0,
                KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        }
        KeyGenParameterSpec spec = builder.build();
        kg.init(spec);
        return kg.generateKey();
    }

    private SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) return null;
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }
}
