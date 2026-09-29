package org.hdo.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** SharedPreferences wrapper: API token, cached data, settings, and Keystore-encrypted login. */
public final class Store {
    private static final String PREFS = "hdo";
    private static final String KEY_ALIAS = "hdo-login";

    private Store() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String get(Context c, String k) { return prefs(c).getString(k, null); }

    static void put(Context c, String k, String v) {
        if (v == null) prefs(c).edit().remove(k).apply();
        else prefs(c).edit().putString(k, v).apply();
    }

    // ---- token ----
    static String token(Context c) { return get(c, "token"); }

    static void setToken(Context c, String t) { put(c, "token", t); }

    /** Seconds since epoch when the JWT expires, or 0 if unknown. */
    static long tokenExp(String jwt) {
        try {
            String[] p = jwt.split("\\.");
            String json = new String(Base64.decode(p[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING),
                    StandardCharsets.UTF_8);
            return new JSONObject(json).optLong("exp", 0);
        } catch (Exception e) {
            return 0;
        }
    }

    static boolean tokenFresh(String jwt, long marginSec) {
        if (jwt == null || jwt.isEmpty()) return false;
        long exp = tokenExp(jwt);
        return exp == 0 || exp > System.currentTimeMillis() / 1000 + marginSec;
    }

    static boolean loggedIn(Context c) {
        return token(c) != null || hasLogin(c);
    }

    // ---- settings (JSON owned by the UI) ----
    static JSONObject settings(Context c) {
        try {
            String s = get(c, "settings");
            return s == null ? defaultSettings() : new JSONObject(s);
        } catch (Exception e) {
            return defaultSettings();
        }
    }

    static JSONObject defaultSettings() {
        JSONObject o = new JSONObject();
        try {
            o.put("remind", false);
            o.put("times", new org.json.JSONArray().put("21:00"));
            o.put("skipIfDone", true);
            o.put("skipShabbos", true);
        } catch (Exception ignored) {}
        return o;
    }

    // ---- saved login (AES-GCM key kept in the Android Keystore, never leaves the device) ----
    static boolean hasLogin(Context c) { return get(c, "login") != null; }

    static void saveLogin(Context c, String user, String pass) {
        try {
            JSONObject o = new JSONObject().put("u", user).put("p", pass);
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.ENCRYPT_MODE, key());
            byte[] enc = ci.doFinal(o.toString().getBytes(StandardCharsets.UTF_8));
            put(c, "login", Base64.encodeToString(ci.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(enc, Base64.NO_WRAP));
        } catch (Exception e) {
            put(c, "login", null);
        }
    }

    /** {user, pass} or null. */
    static String[] loadLogin(Context c) {
        String s = get(c, "login");
        if (s == null) return null;
        try {
            String[] parts = s.split(":");
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            JSONObject o = new JSONObject(new String(ci.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
                    StandardCharsets.UTF_8));
            return new String[]{o.getString("u"), o.getString("p")};
        } catch (Exception e) {
            return null;
        }
    }

    static String savedUsername(Context c) {
        String[] l = loadLogin(c);
        return l != null ? l[0] : get(c, "username");
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return kg.generateKey();
    }

    static void clearAll(Context c) {
        prefs(c).edit().clear().apply();
    }
}
