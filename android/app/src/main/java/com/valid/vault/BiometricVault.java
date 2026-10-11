package com.valid.vault;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

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

@CapacitorPlugin(name = "BiometricVault")
public class BiometricVault extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String LEGACY_ALIAS = "valid_vault_biometric_key";
    private static final String ALIAS_A = "valid_vault_biometric_key_a";
    private static final String ALIAS_B = "valid_vault_biometric_key_b";
    private static final String TRANSFORMATION = KeyProperties.KEY_ALGORITHM_AES + "/" + KeyProperties.BLOCK_MODE_GCM + "/" + KeyProperties.ENCRYPTION_PADDING_NONE;
    private static final int GCM_TAG_BITS = 128;
    private static final int DEVICE_CREDENTIAL_MIN_SDK = 30;
    private static final String CODE_CANCELLED = "cancelled";
    private static final String CODE_INVALIDATED = "invalidated";
    private static final String CODE_LOCKED_OUT = "locked-out";
    private static final String CODE_MISSING = "missing";
    private static final String CODE_FAILED = "failed";

    private interface AuthCallback {
        void onSuccess(Cipher cipher);
        void onError(String message, String code);
    }

    private static boolean allowsDeviceCredential() {
        return Build.VERSION.SDK_INT >= DEVICE_CREDENTIAL_MIN_SDK;
    }

    private static int authenticators() {
        int strong = BiometricManager.Authenticators.BIOMETRIC_STRONG;
        return allowsDeviceCredential() ? strong | BiometricManager.Authenticators.DEVICE_CREDENTIAL : strong;
    }

    private static boolean knownAlias(String alias) {
        return LEGACY_ALIAS.equals(alias) || ALIAS_A.equals(alias) || ALIAS_B.equals(alias);
    }

    private static String aliasOrLegacy(String alias) {
        return alias != null && knownAlias(alias) ? alias : LEGACY_ALIAS;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(authenticators());
        JSObject ret = new JSObject();
        ret.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("code", result);
        ret.put("deviceCredential", allowsDeviceCredential());
        call.resolve(ret);
    }

    @PluginMethod
    public void enroll(final PluginCall call) {
        final String masterKeyB64 = call.getString("masterKey");
        final String requested = call.getString("alias");
        if (masterKeyB64 == null) { call.reject("Missing master key", CODE_FAILED); return; }
        final String alias = ALIAS_A.equals(requested) || ALIAS_B.equals(requested) ? requested : ALIAS_A;
        final Cipher cipher;
        try {
            deleteAlias(alias);
            SecretKey key = generateKey(alias);
            cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);
        } catch (Exception e) {
            deleteQuietly(alias);
            call.reject("Fingerprint setup failed: " + e.getMessage(), CODE_FAILED);
            return;
        }
        authenticate(cipher, new AuthCallback() {
            @Override public void onSuccess(Cipher authed) {
                try {
                    byte[] plain = Base64.decode(masterKeyB64, Base64.NO_WRAP);
                    byte[] ct = authed.doFinal(plain);
                    JSObject ret = new JSObject();
                    ret.put("wrapped", Base64.encodeToString(ct, Base64.NO_WRAP));
                    ret.put("iv", Base64.encodeToString(authed.getIV(), Base64.NO_WRAP));
                    ret.put("alias", alias);
                    call.resolve(ret);
                } catch (Exception e) {
                    deleteQuietly(alias);
                    call.reject("Fingerprint setup failed: " + e.getMessage(), CODE_FAILED);
                }
            }
            @Override public void onError(String message, String code) {
                deleteQuietly(alias);
                call.reject(message, code);
            }
        });
    }

    @PluginMethod
    public void unlock(final PluginCall call) {
        final String wrappedB64 = call.getString("wrapped");
        final String ivB64 = call.getString("iv");
        final String alias = aliasOrLegacy(call.getString("alias"));
        if (wrappedB64 == null || ivB64 == null) { call.reject("No fingerprint is enrolled", CODE_MISSING); return; }
        final Cipher cipher;
        try {
            SecretKey key = getKey(alias);
            if (key == null) { call.reject("No fingerprint is enrolled on this device", CODE_MISSING); return; }
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
            cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        } catch (KeyPermanentlyInvalidatedException e) {
            call.reject("Fingerprints on this device changed, so fingerprint unlock was reset", CODE_INVALIDATED);
            return;
        } catch (Exception e) {
            call.reject("Fingerprint unlock failed: " + e.getMessage(), CODE_FAILED);
            return;
        }
        authenticate(cipher, new AuthCallback() {
            @Override public void onSuccess(Cipher authed) {
                try {
                    byte[] plain = authed.doFinal(Base64.decode(wrappedB64, Base64.NO_WRAP));
                    JSObject ret = new JSObject();
                    ret.put("masterKey", Base64.encodeToString(plain, Base64.NO_WRAP));
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Fingerprint unlock failed: " + e.getMessage(), CODE_FAILED);
                }
            }
            @Override public void onError(String message, String code) { call.reject(message, code); }
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String alias = call.getString("alias");
        try {
            if (alias == null) {
                deleteAlias(LEGACY_ALIAS);
                deleteAlias(ALIAS_A);
                deleteAlias(ALIAS_B);
            } else if (knownAlias(alias)) {
                deleteAlias(alias);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Remove failed: " + e.getMessage(), CODE_FAILED);
        }
    }

    private void authenticate(final Cipher cipher, final AuthCallback cb) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) { cb.onError("The app is not ready for fingerprint yet", CODE_FAILED); return; }
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                Executor executor = ContextCompat.getMainExecutor(getContext());
                BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                        if (crypto == null || crypto.getCipher() == null) { cb.onError("Fingerprint did not unlock the key", CODE_FAILED); return; }
                        cb.onSuccess(crypto.getCipher());
                    }
                    @Override public void onAuthenticationError(int errorCode, CharSequence errString) {
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON || errorCode == BiometricPrompt.ERROR_CANCELED) {
                            cb.onError("Fingerprint was cancelled", CODE_CANCELLED);
                        } else if (errorCode == BiometricPrompt.ERROR_LOCKOUT || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                            cb.onError("Too many fingerprint attempts. Unlock your phone, then try again", CODE_LOCKED_OUT);
                        } else {
                            cb.onError("Fingerprint error: " + errString, CODE_FAILED);
                        }
                    }
                    @Override public void onAuthenticationFailed() {}
                });
                BiometricPrompt.PromptInfo.Builder builder = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Valid Vault")
                    .setAllowedAuthenticators(authenticators());
                if (allowsDeviceCredential()) {
                    builder.setSubtitle("Unlock with fingerprint or device PIN");
                } else {
                    builder.setSubtitle("Unlock with fingerprint");
                    builder.setNegativeButtonText("Use password");
                }
                try {
                    prompt.authenticate(builder.build(), new BiometricPrompt.CryptoObject(cipher));
                } catch (Exception e) {
                    cb.onError("Fingerprint is not available: " + e.getMessage(), CODE_FAILED);
                }
            }
        });
    }

    private SecretKey generateKey(String alias) throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true);
        if (allowsDeviceCredential()) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        }
        kg.init(builder.build());
        return kg.generateKey();
    }

    private SecretKey getKey(String alias) throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (!ks.containsAlias(alias)) return null;
        return (SecretKey) ks.getKey(alias, null);
    }

    private void deleteAlias(String alias) throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(alias)) ks.deleteEntry(alias);
    }

    private void deleteQuietly(String alias) {
        try { deleteAlias(alias); } catch (Exception ignored) {}
    }
}
