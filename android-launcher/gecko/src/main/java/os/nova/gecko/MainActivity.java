/*
 * SPDX-License-Identifier: MIT
 * Copyright (C) 2026 RedRider21
 *
 * Sorgente recuperato per decompilazione (CFR 0.152) dal build Gecko del
 * 2026-09-25, dopo la perdita dei sorgenti originali. Tenere presente che
 * commenti e nomi di alcune variabili locali possono essere andati persi.
 */
package os.nova.gecko;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.role.RoleManager;
import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.location.LocationManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.nfc.NfcAdapter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.telephony.SmsManager;
import android.telephony.TelephonyManager;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import org.mozilla.gecko.util.GeckoBundle;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;
import os.nova.gecko.BrowserActivity;
import os.nova.gecko.CallHub;
import os.nova.gecko.MailBridge;
import os.nova.gecko.MotoreGecko;
import os.nova.gecko.ShellServer;

public class MainActivity
extends Activity {
    private static final String TAG = "NovaGeckoSpike";
    private static final int RICHIESTA_MIC = 4711;
    private static final int RICHIESTA_MEDIA = 4712;
    private static final int RICHIESTA_SMS = 4713;
    public static final String ORIGIN_ASSET = "asset";
    public static final String ORIGIN_INTERNAL = "internal";
    public static final String ORIGIN_EXTENSION = "extension";
    public static final String ORIGIN_HTTP = "http";
    private static final String DEV_URL = "http://10.0.2.2:8091/index.html";
    public static final String ORIGIN_LOCAL = "local";
    private ShellServer server;
    private MailBridge mail;
    private WebExtension.Port portaNativa;
    private static final String ASSET_SHELL = "www";
    private static final String ASSET_INDEX = "resource://android/assets/www/index.html";
    private GeckoRuntime runtime;
    private GeckoSession session;
    private GeckoView view;
    private boolean permessiInCorso = false;
    private final ArrayDeque<Runnable> permessiInCoda = new ArrayDeque();
    private GeckoSession.PermissionDelegate.MediaCallback mediaInAttesa;
    private GeckoSession.PermissionDelegate.MediaSource[] videoInAttesa;
    private GeckoSession.PermissionDelegate.MediaSource[] audioInAttesa;
    private volatile Boolean torciaAccesa = null;
    private CameraManager.TorchCallback callbackTorcia;
    private final Handler rimandoStato = new Handler(Looper.getMainLooper());
    private final Runnable mandaStato = this::inviaStatoAllaShell;
    private BroadcastReceiver ricevitoreSensori;

    protected void onCreate(Bundle savedInstanceState) {
        String origin;
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 28) {
            this.getWindow().getAttributes().layoutInDisplayCutoutMode = 1;
        }
        if ((origin = this.getIntent().getStringExtra("origin")) == null) {
            origin = ORIGIN_LOCAL;
        }
        this.runtime = MotoreGecko.get((Context)this);
        this.session = new GeckoSession();
        this.session.setPermissionDelegate((GeckoSession.PermissionDelegate)new PermessiMedia());
        this.session.open(this.runtime);
        this.view = new GeckoView((Context)this);
        this.view.setSession(this.session);
        this.setContentView((View)this.view);
        Object uri = ORIGIN_INTERNAL.equals(origin) ? this.copyShellToInternalAndGetUrl() : (ORIGIN_HTTP.equals(origin) ? DEV_URL : (ORIGIN_EXTENSION.equals(origin) ? null : (ORIGIN_LOCAL.equals(origin) ? this.avviaServerLocale() : ASSET_INDEX)));
        Log.i((String)TAG, (String)("origine=" + origin + " uri=" + (String)uri));
        this.installaPonteECarica((String)uri);
        this.ascoltaISensori();
        this.ascoltaLaTorcia();
        this.mail = new MailBridge(this.getApplicationContext(), (tipo, a) -> new Handler(Looper.getMainLooper()).post(() -> this.inviaEvento(tipo, a)));
        this.immersive();
    }

    private void installaPonteECarica(final String uri) {
        MotoreGecko.alPonte(new MotoreGecko.AlPonte(){

            @Override
            public void pronto(WebExtension estensione) {
                estensione.setMessageDelegate((WebExtension.MessageDelegate)new BridgeMessages(), "browser");
                MainActivity.this.carica(uri);
            }

            @Override
            public void assente(Throwable errore) {
                MainActivity.this.carica(uri);
            }
        });
    }

    private void carica(String uri) {
        this.runOnUiThread(() -> {
            if (this.session == null) {
                return;
            }
            Log.i((String)TAG, (String)("carico la shell: " + uri));
            this.session.loadUri(uri);
        });
    }

    private String avviaServerLocale() {
        File dir = this.preparaShell();
        if (dir == null) {
            return ASSET_INDEX;
        }
        this.server = new ShellServer(dir, 8731);
        String url = this.server.avvia();
        return url != null ? url : ASSET_INDEX;
    }

    public void pushCall() {
        new Handler(Looper.getMainLooper()).post(() -> {
            String stato = "ended";
            String numero = "";
            try {
                stato = CallHub.stato();
                numero = CallHub.numero();
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"stato della chiamata non leggibile", (Throwable)e);
            }
            this.inviaEvento("call.update", stato, numero, "");
        });
    }

    private void inviaEvento(String tipo, Object ... args) {
        if (this.portaNativa == null) {
            Log.w((String)TAG, (String)("nessuna porta nativa aperta: evento non inviato: " + tipo));
            return;
        }
        try {
            this.portaNativa.postMessage(MainActivity.evento(tipo, args));
            Log.i((String)TAG, (String)("evento inviato alla pagina: " + tipo));
        }
        catch (Exception e) {
            Log.e((String)TAG, (String)("evento non inviato: " + tipo), (Throwable)e);
        }
    }

    private static JSONObject evento(String tipo, Object ... args) {
        JSONObject o = new JSONObject();
        try {
            o.put("evento", (Object)tipo);
            if (MainActivity.misti(args)) {
                JSONObject m = new JSONObject();
                for (int i = 0; i < args.length; ++i) {
                    m.put(String.valueOf(i), args[i]);
                }
                o.put("argsMisti", (Object)m);
            } else {
                o.put("args", (Object)new JSONArray(Arrays.asList(args)));
            }
        }
        catch (Exception e) {
            Log.e((String)TAG, (String)("evento non costruito: " + tipo), (Throwable)e);
        }
        return o;
    }

    private static boolean misti(Object[] args) {
        if (args == null || args.length < 2 || args[0] == null) {
            return false;
        }
        Class<?> primo = args[0].getClass();
        for (int i = 1; i < args.length; ++i) {
            if (args[i] != null && primo.equals(args[i].getClass())) continue;
            return true;
        }
        return false;
    }

    private void inviaStatoAllaShell() {
        if (this.portaNativa == null) {
            Log.w((String)TAG, (String)"nessuna porta nativa aperta: stato non inviato");
            return;
        }
        JSONObject s = new JSONObject();
        try {
            String nome = "?";
            String codice = "0";
            try {
                PackageInfo p = this.getPackageManager().getPackageInfo(this.getPackageName(), 0);
                nome = p.versionName;
                long c = Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : (long)p.versionCode;
                codice = String.valueOf(c);
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"versione non leggibile", (Throwable)e);
            }
            s.put("appVersion", (Object)("{\"name\":\"" + nome + "\",\"code\":" + codice + "}"));
            BatteryManager bm = (BatteryManager)this.getSystemService("batterymanager");
            s.put("batteryLevel", bm == null ? -1 : bm.getIntProperty(4));
            boolean mic = this.checkSelfPermission("android.permission.RECORD_AUDIO") == 0;
            s.put("micGranted", mic);
            s.put("micReady", mic);
            boolean razionale = false;
            try {
                razionale = this.shouldShowRequestPermissionRationale("android.permission.RECORD_AUDIO");
            }
            catch (Exception exception) {
                // empty catch block
            }
            s.put("micDiag", (Object)(mic ? "granted" : (razionale ? "askable" : "blocked")));
            boolean dialer = false;
            try {
                dialer = this.isDialer();
            }
            catch (Exception exception) {
                // empty catch block
            }
            s.put("isDialer", dialer);
            boolean priv = false;
            try {
                priv = this.privilegiato();
            }
            catch (Exception exception) {
                // empty catch block
            }
            s.put("privileged", priv);
            s.put("sensorStates", (Object)this.statoSensori());
            s.put("shellSource", (Object)(this.getIntent().getStringExtra("origin") == null ? ORIGIN_LOCAL : this.getIntent().getStringExtra("origin")));
            String chiamata = null;
            try {
                chiamata = CallHub.statoJson();
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"stato della chiamata non leggibile", (Throwable)e);
            }
            s.put("currentCallState", (Object)(chiamata == null ? "{\"state\":\"ended\"}" : chiamata));
            String accountMail = null;
            try {
                accountMail = this.mail.account();
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"account di posta non leggibile", (Throwable)e);
            }
            if (accountMail != null) {
                s.put("mailAccount", (Object)accountMail);
            }
        }
        catch (Exception e) {
            Log.e((String)TAG, (String)"stato non costruito", (Throwable)e);
            return;
        }
        try {
            this.portaNativa.postMessage(MainActivity.evento("shell.state", s));
            Log.i((String)TAG, (String)("stato inviato alla shell: " + s));
        }
        catch (Exception e) {
            Log.e((String)TAG, (String)"stato non inviato", (Throwable)e);
        }
    }

    private void unPermessoAllaVolta(Runnable richiesta) {
        if (this.permessiInCorso) {
            Log.i((String)TAG, (String)"richiesta di permessi in coda: ce n'\u00e8 gi\u00e0 una aperta");
            this.permessiInCoda.add(richiesta);
            return;
        }
        this.permessiInCorso = true;
        richiesta.run();
    }

    private void turnoSuccessivoDeiPermessi() {
        Runnable prossima = this.permessiInCoda.poll();
        if (prossima == null) {
            this.permessiInCorso = false;
            return;
        }
        prossima.run();
    }

    public void onRequestPermissionsResult(int codice, String[] permessi, int[] esiti) {
        super.onRequestPermissionsResult(codice, permessi, esiti);
        if (codice == 4712) {
            boolean tutti = esiti.length > 0;
            for (int e : esiti) {
                if (e == 0) continue;
                tutti = false;
            }
            Log.i((String)TAG, (String)("permessi media per la pagina: " + (tutti ? "concessi" : "negati")));
            this.rispondiAllaRichiestaMedia(tutti);
            this.inviaStatoAllaShell();
        } else if (codice == 4711) {
            boolean concesso = esiti.length > 0 && esiti[0] == 0;
            Log.i((String)TAG, (String)("permesso microfono: " + (concesso ? "concesso" : "negato")));
            this.inviaEvento("mic.result", concesso);
            this.inviaStatoAllaShell();
        }
        this.turnoSuccessivoDeiPermessi();
    }

    private void rispondiAllaRichiestaMedia(boolean concesso) {
        GeckoSession.PermissionDelegate.MediaCallback cb = this.mediaInAttesa;
        GeckoSession.PermissionDelegate.MediaSource[] v = this.videoInAttesa;
        GeckoSession.PermissionDelegate.MediaSource[] a = this.audioInAttesa;
        this.mediaInAttesa = null;
        this.videoInAttesa = null;
        this.audioInAttesa = null;
        if (cb == null) {
            return;
        }
        if (concesso) {
            cb.grant(v != null && v.length > 0 ? v[0] : null, a != null && a.length > 0 ? a[0] : null);
        } else {
            cb.reject();
        }
    }

    private void inviaRisposta(int id, Object valore) {
        if (id < 0) {
            return;
        }
        if (this.portaNativa == null) {
            Log.w((String)TAG, (String)("nessuna porta nativa aperta: risposta " + id + " non inviata"));
            return;
        }
        try {
            JSONObject o = new JSONObject();
            o.put("evento", (Object)"__novaRisposta");
            o.put("id", id);
            o.put("valore", valore == null ? JSONObject.NULL : valore);
            Log.i((String)TAG, (String)("risposta grezza: " + o));
            this.portaNativa.postMessage(o);
            Log.i((String)TAG, (String)("risposta inviata: id=" + id + " valore=" + valore));
        }
        catch (Exception e) {
            Log.e((String)TAG, (String)("risposta non inviata: id=" + id), (Throwable)e);
        }
    }

    private static String argomento(Object[] args, int i) {
        return args != null && args.length > i && args[i] != null ? String.valueOf(args[i]) : "";
    }

    private static boolean booleano(Object[] args, int i) {
        if (args == null || args.length <= i || args[i] == null) {
            return false;
        }
        Object v = args[i];
        if (v instanceof Boolean) {
            return (Boolean)v;
        }
        if (v instanceof Number) {
            return ((Number)v).doubleValue() != 0.0;
        }
        return "true".equals(String.valueOf(v));
    }

    private void inviaSchermata(Bitmap bmp) {
        int h;
        if (bmp == null) {
            return;
        }
        int max = 1280;
        int w = bmp.getWidth();
        float sc = Math.min(1.0f, (float)max / (float)Math.max(1, Math.max(w, h = bmp.getHeight())));
        Bitmap out = sc < 1.0f ? Bitmap.createScaledBitmap((Bitmap)bmp, (int)Math.round((float)w * sc), (int)Math.round((float)h * sc), (boolean)true) : bmp;
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 85, (OutputStream)bos);
        String b64 = Base64.encodeToString((byte[])bos.toByteArray(), (int)2);
        this.inviaEvento("shell.shot", "data:image/jpeg;base64," + b64);
        if (out != bmp) {
            out.recycle();
        }
    }

    private void installaAggiornamento(String url) {
        if (url == null || url.isEmpty()) {
            Toast.makeText((Context)this, (CharSequence)"Nessun indirizzo per l'aggiornamento", (int)1).show();
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= 26 && !this.getPackageManager().canRequestPackageInstalls()) {
                Toast.makeText((Context)this, (CharSequence)"Consenti l'installazione da NovaOS, poi riprova", (int)1).show();
                try {
                    this.startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse((String)("package:" + this.getPackageName()))));
                }
                catch (Exception exception) {
                    // empty catch block
                }
                return;
            }
            final DownloadManager dm = (DownloadManager)this.getSystemService("download");
            if (dm == null) {
                return;
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse((String)url));
            req.setTitle((CharSequence)"NovaOS \u2014 aggiornamento");
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(1);
            req.setDestinationInExternalFilesDir((Context)this, Environment.DIRECTORY_DOWNLOADS, "NovaOS-update.apk");
            final long id = dm.enqueue(req);
            Toast.makeText((Context)this, (CharSequence)"Scaricamento aggiornamento\u2026", (int)0).show();
            BroadcastReceiver rcv = new BroadcastReceiver(){

                public void onReceive(Context c, Intent i) {
                    if (i.getLongExtra("extra_download_id", -1L) != id) {
                        return;
                    }
                    try {
                        c.unregisterReceiver((BroadcastReceiver)this);
                    }
                    catch (Exception exception) {
                        // empty catch block
                    }
                    Uri apk = dm.getUriForDownloadedFile(id);
                    if (apk == null) {
                        Toast.makeText((Context)c, (CharSequence)"Download non riuscito", (int)1).show();
                        return;
                    }
                    Intent it = new Intent("android.intent.action.VIEW").setDataAndType(apk, "application/vnd.android.package-archive").addFlags(0x10000001);
                    try {
                        MainActivity.this.startActivity(it);
                    }
                    catch (Exception e) {
                        Toast.makeText((Context)c, (CharSequence)"Installer non disponibile", (int)1).show();
                    }
                }
            };
            IntentFilter flt = new IntentFilter("android.intent.action.DOWNLOAD_COMPLETE");
            if (Build.VERSION.SDK_INT >= 33) {
                this.registerReceiver(rcv, flt, 2);
            } else {
                this.registerReceiver(rcv, flt);
            }
        }
        catch (Exception e) {
            Toast.makeText((Context)this, (CharSequence)("Errore aggiornamento: " + e.getMessage()), (int)1).show();
        }
    }

    private void apri(Intent i) {
        i.addFlags(0x10000000);
        try {
            this.startActivity(i);
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)("nessuna app per " + i.getAction() + " " + i.getData()), (Throwable)e);
        }
    }

    private void apriSms(String numero, String testo) {
        Intent i = new Intent("android.intent.action.SENDTO", Uri.parse((String)("smsto:" + numero)));
        i.putExtra("sms_body", testo == null ? "" : testo);
        this.apri(i);
    }

    private void openSetting(String which) {
        Intent i = new Intent();
        Log.i((String)TAG, (String)("apro il pannello di sistema: " + (switch (which == null ? "" : which) {
            case "wifi" -> {
                i.setAction(Build.VERSION.SDK_INT >= 29 ? "android.settings.panel.action.WIFI" : "android.settings.WIFI_SETTINGS");
                yield "Wi-Fi";
            }
            case "bluetooth" -> {
                i.setAction("android.settings.BLUETOOTH_SETTINGS");
                yield "Bluetooth";
            }
            case "airplane" -> {
                i.setAction("android.settings.AIRPLANE_MODE_SETTINGS");
                yield "Modalit\u00e0 aereo";
            }
            case "nfc" -> {
                i.setAction("android.settings.NFC_SETTINGS");
                yield "NFC";
            }
            case "location" -> {
                i.setAction("android.settings.LOCATION_SOURCE_SETTINGS");
                yield "Posizione";
            }
            case "data" -> {
                i.setAction("android.settings.DATA_ROAMING_SETTINGS");
                yield "Dati mobili";
            }
            case "hotspot" -> {
                i.setClassName("com.android.settings", "com.android.settings.TetherSettings");
                yield "Hotspot";
            }
            case "date" -> {
                i.setAction("android.settings.DATE_SETTINGS");
                yield "Data e ora";
            }
            case "locale" -> {
                i.setAction("android.settings.LOCALE_SETTINGS");
                yield "Lingua";
            }
            case "appdetails" -> {
                i.setAction("android.settings.APPLICATION_DETAILS_SETTINGS").setData(Uri.parse((String)("package:" + this.getPackageName())));
                yield "Permessi app";
            }
            default -> {
                i.setAction("android.settings.SETTINGS");
                yield "Impostazioni";
            }
        })));
        this.apri(i);
    }

    private boolean privilegiato() {
        try {
            return this.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") == 0;
        }
        catch (Exception e) {
            return false;
        }
    }

    private Boolean leggiWifi() {
        try {
            WifiManager wm = (WifiManager)this.getApplicationContext().getSystemService("wifi");
            return wm == null ? null : Boolean.valueOf(wm.isWifiEnabled());
        }
        catch (Exception e) {
            return null;
        }
    }

    private Boolean leggiBt() {
        try {
            BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
            return a == null ? null : Boolean.valueOf(a.isEnabled());
        }
        catch (Exception e) {
            return null;
        }
    }

    private Boolean leggiNfc() {
        try {
            NfcAdapter a = NfcAdapter.getDefaultAdapter((Context)this);
            return a == null ? null : Boolean.valueOf(a.isEnabled());
        }
        catch (Exception e) {
            return null;
        }
    }

    private Boolean leggiPosizione() {
        try {
            LocationManager lm = (LocationManager)this.getSystemService("location");
            if (lm == null) {
                return null;
            }
            if (Build.VERSION.SDK_INT >= 28) {
                return lm.isLocationEnabled();
            }
            return lm.isProviderEnabled("gps") || lm.isProviderEnabled("network");
        }
        catch (Exception e) {
            return null;
        }
    }

    private Boolean leggiAereo() {
        try {
            return Settings.Global.getInt((ContentResolver)this.getContentResolver(), (String)"airplane_mode_on", (int)0) != 0;
        }
        catch (Exception e) {
            return null;
        }
    }

    private Boolean leggiDatiMobili() {
        try {
            TelephonyManager tm = (TelephonyManager)this.getSystemService("phone");
            if (tm == null) {
                return null;
            }
            Method m = tm.getClass().getMethod("isDataEnabled", new Class[0]);
            Object r = m.invoke(tm, new Object[0]);
            return r instanceof Boolean ? (Boolean)r : null;
        }
        catch (Exception e) {
            return null;
        }
    }

    private Boolean leggiTorcia() {
        return this.torciaAccesa;
    }

    private void ascoltaLaTorcia() {
        try {
            CameraManager cm = (CameraManager)this.getSystemService("camera");
            if (cm == null) {
                return;
            }
            this.callbackTorcia = new CameraManager.TorchCallback(){

                public void onTorchModeChanged(String id, boolean acceso) {
                    MainActivity.this.torciaAccesa = acceso;
                    MainActivity.this.ripubblicaStato();
                }

                public void onTorchModeUnavailable(String id) {
                    MainActivity.this.torciaAccesa = null;
                    MainActivity.this.ripubblicaStato();
                }
            };
            cm.registerTorchCallback(this.callbackTorcia, new Handler(Looper.getMainLooper()));
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"la torcia non \u00e8 osservabile", (Throwable)e);
        }
    }

    private String statoSensori() {
        JSONObject o = new JSONObject();
        try {
            Boolean torcia;
            Boolean dati;
            Boolean aereo;
            Boolean pos;
            Boolean nfc;
            Boolean bt;
            Boolean wifi = this.leggiWifi();
            if (wifi != null) {
                o.put("wifi", (Object)wifi);
            }
            if ((bt = this.leggiBt()) != null) {
                o.put("bt", (Object)bt);
            }
            if ((nfc = this.leggiNfc()) != null) {
                o.put("nfc", (Object)nfc);
            }
            if ((pos = this.leggiPosizione()) != null) {
                o.put("location", (Object)pos);
            }
            if ((aereo = this.leggiAereo()) != null) {
                o.put("airplane", (Object)aereo);
            }
            if ((dati = this.leggiDatiMobili()) != null) {
                o.put("mobileData", (Object)dati);
            }
            if ((torcia = this.leggiTorcia()) != null) {
                o.put("torch", (Object)torcia);
            }
            o.put("privileged", this.privilegiato());
            o.put("native", true);
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"stato dei sensori non costruito", (Throwable)e);
        }
        return o.toString();
    }

    private boolean setWifi(boolean on) {
        try {
            WifiManager wm = (WifiManager)this.getApplicationContext().getSystemService("wifi");
            if (wm != null && (Build.VERSION.SDK_INT < 29 || this.privilegiato())) {
                wm.setWifiEnabled(on);
                Toast.makeText((Context)this, (CharSequence)(on ? "Wi-Fi attivato" : "Wi-Fi disattivato"), (int)0).show();
                return true;
            }
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"commutazione Wi-Fi non riuscita", (Throwable)e);
        }
        this.openSetting("wifi");
        return false;
    }

    private boolean setBluetooth(boolean on) {
        try {
            BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
            if (a == null) {
                Toast.makeText((Context)this, (CharSequence)"Bluetooth non disponibile", (int)0).show();
                return false;
            }
            if (this.privilegiato() || Build.VERSION.SDK_INT < 33) {
                boolean ok;
                boolean bl = ok = on ? a.enable() : a.disable();
                if (ok) {
                    Toast.makeText((Context)this, (CharSequence)(on ? "Attivo il Bluetooth\u2026" : "Disattivo il Bluetooth\u2026"), (int)0).show();
                    return true;
                }
            }
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"commutazione Bluetooth non riuscita", (Throwable)e);
        }
        if (on) {
            this.apri(new Intent("android.bluetooth.adapter.action.REQUEST_ENABLE"));
        } else {
            this.openSetting("bluetooth");
        }
        return false;
    }

    private boolean setAereo(boolean on) {
        if (this.privilegiato()) {
            try {
                Settings.Global.putInt((ContentResolver)this.getContentResolver(), (String)"airplane_mode_on", (int)(on ? 1 : 0));
                this.sendBroadcast(new Intent("android.intent.action.AIRPLANE_MODE").putExtra("state", on));
                Toast.makeText((Context)this, (CharSequence)(on ? "Modalit\u00e0 aereo attiva" : "Modalit\u00e0 aereo disattivata"), (int)0).show();
                return true;
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"modalit\u00e0 aereo non commutabile", (Throwable)e);
            }
        }
        this.openSetting("airplane");
        return false;
    }

    private boolean setPosizione(boolean on) {
        if (this.privilegiato()) {
            try {
                Settings.Secure.putInt((ContentResolver)this.getContentResolver(), (String)"location_mode", (int)(on ? 3 : 0));
                Toast.makeText((Context)this, (CharSequence)(on ? "Posizione attivata" : "Posizione disattivata"), (int)0).show();
                return true;
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"posizione non commutabile", (Throwable)e);
            }
        }
        this.openSetting("location");
        return false;
    }

    private boolean setNfc(boolean on) {
        if (this.privilegiato()) {
            try {
                NfcAdapter a = NfcAdapter.getDefaultAdapter((Context)this);
                if (a != null) {
                    Method m = NfcAdapter.class.getDeclaredMethod(on ? "enable" : "disable", new Class[0]);
                    m.setAccessible(true);
                    m.invoke(a, new Object[0]);
                    Toast.makeText((Context)this, (CharSequence)(on ? "NFC attivato" : "NFC disattivato"), (int)0).show();
                    return true;
                }
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"NFC non commutabile", (Throwable)e);
            }
        }
        this.openSetting("nfc");
        return false;
    }

    private boolean setDatiMobili(boolean on) {
        if (this.privilegiato()) {
            try {
                TelephonyManager tm = (TelephonyManager)this.getSystemService("phone");
                Method m = tm.getClass().getDeclaredMethod("setDataEnabled", Boolean.TYPE);
                m.setAccessible(true);
                m.invoke(tm, on);
                Toast.makeText((Context)this, (CharSequence)(on ? "Dati mobili attivi" : "Dati mobili disattivati"), (int)0).show();
                return true;
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"dati mobili non commutabili", (Throwable)e);
            }
        }
        this.openSetting("data");
        return false;
    }

    private boolean setTorcia(boolean on) {
        try {
            CameraManager cm = (CameraManager)this.getSystemService("camera");
            if (cm == null) {
                return false;
            }
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics cc = cm.getCameraCharacteristics(id);
                Boolean flash = (Boolean)cc.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer verso = (Integer)cc.get(CameraCharacteristics.LENS_FACING);
                if (!Boolean.TRUE.equals(flash) || verso != null && verso != 1) continue;
                cm.setTorchMode(id, on);
                return true;
            }
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"torcia non commutabile", (Throwable)e);
        }
        return false;
    }

    private void ripubblicaStato() {
        this.rimandoStato.removeCallbacks(this.mandaStato);
        this.rimandoStato.postDelayed(this.mandaStato, 250L);
    }

    private void ascoltaISensori() {
        this.ricevitoreSensori = new BroadcastReceiver(){

            public void onReceive(Context c, Intent i) {
                Log.i((String)MainActivity.TAG, (String)("il sistema annuncia un cambio di stato: " + i.getAction()));
                MainActivity.this.ripubblicaStato();
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction("android.net.wifi.WIFI_STATE_CHANGED");
        f.addAction("android.bluetooth.adapter.action.STATE_CHANGED");
        f.addAction("android.intent.action.AIRPLANE_MODE");
        f.addAction("android.nfc.action.ADAPTER_STATE_CHANGED");
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                this.registerReceiver(this.ricevitoreSensori, f, 4);
            } else {
                this.registerReceiver(this.ricevitoreSensori, f);
            }
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"ricevitore dei sensori non registrato", (Throwable)e);
        }
    }

    private static String estensione(String mime) {
        if (mime == null) {
            return ".bin";
        }
        if (mime.contains("png")) {
            return ".png";
        }
        if (mime.contains("jpeg") || mime.contains("jpg")) {
            return ".jpg";
        }
        if (mime.contains("webp")) {
            return ".webp";
        }
        if (mime.contains("gif")) {
            return ".gif";
        }
        if (mime.contains("webm")) {
            return ".webm";
        }
        if (mime.contains("mp4") || mime.contains("m4v")) {
            return mime.startsWith("video") ? ".mp4" : ".m4a";
        }
        if (mime.contains("m4a") || mime.contains("aac")) {
            return ".m4a";
        }
        if (mime.contains("mpeg")) {
            return ".mp3";
        }
        if (mime.contains("ogg")) {
            return ".ogg";
        }
        if (mime.contains("wav")) {
            return ".wav";
        }
        if (mime.contains("pdf")) {
            return ".pdf";
        }
        if (mime.startsWith("image/")) {
            return ".jpg";
        }
        if (mime.startsWith("video/")) {
            return ".mp4";
        }
        if (mime.startsWith("audio/")) {
            return ".m4a";
        }
        return ".bin";
    }

    private static String mimeDi(String dataUrl) {
        int comma = dataUrl.indexOf(44);
        int duepunti = dataUrl.indexOf(58);
        if (comma < 0 || duepunti < 0) {
            return "application/octet-stream";
        }
        return dataUrl.substring(duepunti + 1, comma).split(";")[0];
    }

    private static String conContatore(String nome, int n) {
        int dot;
        if (nome == null || nome.trim().isEmpty()) {
            nome = "novaos-" + System.currentTimeMillis();
        }
        return (dot = nome.lastIndexOf(46)) > 0 ? nome.substring(0, dot) + "-" + n + nome.substring(dot) : nome + "-" + n;
    }

    private File scriviInCache(String dataUrl, String nome, String mime) throws Exception {
        String pulito;
        int comma = dataUrl.lastIndexOf(44);
        if (comma < 0) {
            throw new IllegalArgumentException("data URL senza virgola");
        }
        byte[] bytes = Base64.decode((String)dataUrl.substring(comma + 1), (int)0);
        File dir = new File(this.getCacheDir(), "share");
        dir.mkdirs();
        String string = pulito = nome == null || nome.trim().isEmpty() ? "novaos-" + System.currentTimeMillis() : nome.replaceAll("[^A-Za-z0-9._ -]", "_");
        if (pulito.indexOf(46) < 0) {
            pulito = pulito + MainActivity.estensione(mime);
        }
        File f = new File(dir, pulito);
        FileOutputStream fos = new FileOutputStream(f);
        fos.write(bytes);
        fos.close();
        return f;
    }

    private void condividi(String dataUrl, String nome, String etichetta) {
        try {
            String mime = MainActivity.mimeDi(dataUrl);
            File f = this.scriviInCache(dataUrl, nome, mime);
            Uri uri = Uri.parse((String)("content://os.nova.gecko.share/" + f.getName()));
            Intent send = new Intent("android.intent.action.SEND").setType(mime).putExtra("android.intent.extra.STREAM", (Parcelable)uri).addFlags(1);
            send.setClipData(ClipData.newUri((ContentResolver)this.getContentResolver(), (CharSequence)f.getName(), (Uri)uri));
            this.apri(Intent.createChooser((Intent)send, (CharSequence)etichetta).addFlags(1));
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"condivisione non riuscita", (Throwable)e);
            Toast.makeText((Context)this, (CharSequence)"Condivisione non riuscita", (int)0).show();
        }
    }

    private void condividiTanti(String elencoJson) {
        try {
            JSONArray a = new JSONArray(elencoJson);
            ArrayList<Uri> uris = new ArrayList<Uri>();
            String mimeComune = null;
            for (int i = 0; i < a.length(); ++i) {
                JSONObject o = a.getJSONObject(i);
                String data = o.optString("data", "");
                if (data.isEmpty() || data.indexOf(44) < 0) continue;
                String mime = MainActivity.mimeDi(data);
                File f = this.scriviInCache(data, MainActivity.conContatore(o.optString("name", ""), i + 1), mime);
                uris.add(Uri.parse((String)("content://os.nova.gecko.share/" + f.getName())));
                mimeComune = mimeComune == null ? mime : (mimeComune.equals(mime) ? mimeComune : "*/*");
            }
            if (uris.isEmpty()) {
                return;
            }
            Intent send = new Intent("android.intent.action.SEND_MULTIPLE").setType(mimeComune == null ? "*/*" : mimeComune).putParcelableArrayListExtra("android.intent.extra.STREAM", uris).addFlags(1);
            ClipData clip = null;
            for (Uri u : uris) {
                if (clip == null) {
                    clip = ClipData.newUri((ContentResolver)this.getContentResolver(), (CharSequence)u.getLastPathSegment(), (Uri)u);
                    continue;
                }
                clip.addItem(new ClipData.Item(u));
            }
            if (clip != null) {
                send.setClipData(clip);
            }
            this.apri(Intent.createChooser((Intent)send, (CharSequence)"Condividi elementi").addFlags(1));
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"condivisione multipla non riuscita", (Throwable)e);
            Toast.makeText((Context)this, (CharSequence)"Condivisione non riuscita", (int)0).show();
        }
    }

    private boolean isDialer() {
        if (Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = (RoleManager)this.getSystemService("role");
            return rm != null && rm.isRoleHeld("android.app.role.DIALER");
        }
        TelecomManager tm = (TelecomManager)this.getSystemService("telecom");
        return tm != null && this.getPackageName().equals(tm.getDefaultDialerPackage());
    }

    private void esegui(String nome, Object[] args, int idRichiesta) {
        block4: {
            try {
                this.eseguiComando(nome, args, idRichiesta);
            }
            catch (Throwable t) {
                Log.e((String)TAG, (String)("comando fallito: " + nome), (Throwable)t);
                if (idRichiesta < 0) break block4;
                try {
                    this.inviaRisposta(idRichiesta, null);
                }
                catch (Exception exception) {
                    // empty catch block
                }
            }
        }
    }

    private void eseguiComando(String nome, Object[] args, int idRichiesta) {
        switch (nome) {
            case "toast": {
                String msg = args.length > 0 ? String.valueOf(args[0]) : "";
                Toast.makeText((Context)this, (CharSequence)msg, (int)0).show();
                break;
            }
            case "vibrate": {
                long ms = 100L;
                try {
                    if (args.length > 0) {
                        ms = (long)Double.parseDouble(String.valueOf(args[0]));
                    }
                }
                catch (NumberFormatException numberFormatException) {
                    // empty catch block
                }
                Vibrator v = (Vibrator)this.getSystemService("vibrator");
                if (v == null || !v.hasVibrator()) break;
                v.vibrate(VibrationEffect.createOneShot((long)ms, (int)-1));
                break;
            }
            case "openBrowser": {
                Intent i = new Intent((Context)this, BrowserActivity.class);
                i.putExtra("url", args.length > 0 ? String.valueOf(args[0]) : "");
                this.startActivity(i);
                break;
            }
            case "call": {
                TelecomManager tm;
                Uri uri = Uri.parse((String)("tel:" + String.valueOf(MainActivity.argomento(args, 0))));
                if (this.isDialer() && this.checkSelfPermission("android.permission.CALL_PHONE") == 0 && (tm = (TelecomManager)this.getSystemService("telecom")) != null) {
                    try {
                        tm.placeCall(uri, null);
                        Log.i((String)TAG, (String)("call: compongo dal framework telecom (" + uri + ")"));
                        break;
                    }
                    catch (Exception e) {
                        Log.w((String)TAG, (String)"placeCall non riuscito: ripiego sull'Intent", (Throwable)e);
                    }
                }
                boolean puoChiamare = this.checkSelfPermission("android.permission.CALL_PHONE") == 0;
                Log.i((String)TAG, (String)("call: dialer=" + this.isDialer() + " CALL_PHONE=" + puoChiamare + " \u2192 " + (puoChiamare ? "ACTION_CALL" : "ACTION_DIAL")));
                this.apri(new Intent(puoChiamare ? "android.intent.action.CALL" : "android.intent.action.DIAL", uri));
                break;
            }
            case "sms": {
                this.apriSms(String.valueOf(MainActivity.argomento(args, 0)), String.valueOf(MainActivity.argomento(args, 1)));
                break;
            }
            case "sendSms": {
                String numero = String.valueOf(MainActivity.argomento(args, 0));
                String testo = String.valueOf(MainActivity.argomento(args, 1));
                if (numero.isEmpty()) break;
                if (this.checkSelfPermission("android.permission.SEND_SMS") != 0) {
                    this.requestPermissions(new String[]{"android.permission.SEND_SMS"}, 4713);
                    this.apriSms(numero, testo);
                    break;
                }
                try {
                    SmsManager sm = SmsManager.getDefault();
                    sm.sendMultipartTextMessage(numero, null, sm.divideMessage(testo), null, null);
                    Log.i((String)TAG, (String)("SMS inviato direttamente (parti: " + sm.divideMessage(testo).size() + ")"));
                }
                catch (Exception e) {
                    Log.w((String)TAG, (String)"invio diretto non riuscito: ripiego sull'app SMS", (Throwable)e);
                    this.apriSms(numero, testo);
                }
                break;
            }
            case "requestDialerRole": {
                if (Build.VERSION.SDK_INT >= 29) {
                    RoleManager rm = (RoleManager)this.getSystemService("role");
                    if (rm == null || !rm.isRoleAvailable("android.app.role.DIALER") || rm.isRoleHeld("android.app.role.DIALER")) break;
                    this.startActivityForResult(rm.createRequestRoleIntent("android.app.role.DIALER"), 2);
                    break;
                }
                this.apri(new Intent("android.telecom.action.CHANGE_DEFAULT_DIALER").putExtra("android.telecom.extra.CHANGE_DEFAULT_DIALER_PACKAGE_NAME", this.getPackageName()));
                break;
            }
            case "callAnswer": {
                CallHub.answer();
                break;
            }
            case "callHangup": {
                CallHub.hangup();
                break;
            }
            case "callMute": {
                CallHub.mute(MainActivity.booleano(args, 0));
                break;
            }
            case "callSpeaker": {
                CallHub.speaker(MainActivity.booleano(args, 0));
                break;
            }
            case "callDtmf": {
                CallHub.dtmf(String.valueOf(MainActivity.argomento(args, 0)));
                break;
            }
            case "shareImage": {
                this.condividi(MainActivity.argomento(args, 0), "", "Condividi foto");
                break;
            }
            case "shareFile": {
                this.condividi(MainActivity.argomento(args, 0), MainActivity.argomento(args, 1), "Condividi");
                break;
            }
            case "shareFiles": {
                this.condividiTanti(MainActivity.argomento(args, 0));
                break;
            }
            case "shareText": {
                Intent send = new Intent("android.intent.action.SEND").setType("text/plain").putExtra("android.intent.extra.TEXT", MainActivity.argomento(args, 0));
                this.apri(Intent.createChooser((Intent)send, (CharSequence)"Condividi"));
                break;
            }
            case "openSetting": {
                this.openSetting(MainActivity.argomento(args, 0));
                break;
            }
            case "setTorch": {
                this.inviaRisposta(idRichiesta, this.setTorcia(MainActivity.booleano(args, 0)));
                break;
            }
            case "setWifi": {
                this.inviaRisposta(idRichiesta, this.setWifi(MainActivity.booleano(args, 0)));
                break;
            }
            case "setBluetooth": {
                this.inviaRisposta(idRichiesta, this.setBluetooth(MainActivity.booleano(args, 0)));
                break;
            }
            case "setAirplane": {
                this.inviaRisposta(idRichiesta, this.setAereo(MainActivity.booleano(args, 0)));
                break;
            }
            case "setLocation": {
                this.inviaRisposta(idRichiesta, this.setPosizione(MainActivity.booleano(args, 0)));
                break;
            }
            case "setNfc": {
                this.inviaRisposta(idRichiesta, this.setNfc(MainActivity.booleano(args, 0)));
                break;
            }
            case "setMobileData": {
                this.inviaRisposta(idRichiesta, this.setDatiMobili(MainActivity.booleano(args, 0)));
                break;
            }
            case "prefSet": {
                try {
                    this.getSharedPreferences("novaos", 0).edit().putString(MainActivity.argomento(args, 0), MainActivity.argomento(args, 1)).apply();
                }
                catch (Exception e) {
                    Log.w((String)TAG, (String)"preferenza non scritta nello specchio nativo", (Throwable)e);
                }
                if (!"nova:theme".equals(MainActivity.argomento(args, 0))) break;
                MotoreGecko.aggiornaTema((Context)this);
                break;
            }
            case "prefDel": {
                try {
                    this.getSharedPreferences("novaos", 0).edit().remove(MainActivity.argomento(args, 0)).apply();
                }
                catch (Exception e) {
                    Log.w((String)TAG, (String)"preferenza non rimossa dallo specchio nativo", (Throwable)e);
                }
                break;
            }
            case "mailConfigure": {
                this.mail.configure(MainActivity.argomento(args, 0));
                this.inviaStatoAllaShell();
                break;
            }
            case "mailClear": {
                this.mail.clear();
                this.inviaStatoAllaShell();
                break;
            }
            case "mailSend": {
                this.mail.send(MainActivity.argomento(args, 0));
                break;
            }
            case "mailFetch": {
                int limite = 25;
                try {
                    if (args.length > 1) {
                        limite = (int)Double.parseDouble(String.valueOf(args[1]));
                    }
                }
                catch (NumberFormatException testo) {
                    // empty catch block
                }
                this.mail.fetch(MainActivity.argomento(args, 0), limite);
                break;
            }
            case "screenshot": {
                GeckoResult cattura = null;
                try {
                    cattura = this.view.capturePixels();
                }
                catch (Exception e) {
                    Log.e((String)TAG, (String)"cattura non avviata", (Throwable)e);
                }
                if (cattura == null) break;
                cattura.accept(bmp -> {
                    try {
                        this.inviaSchermata((Bitmap)bmp);
                    }
                    catch (Exception e) {
                        Log.e((String)TAG, (String)"schermata non inviata", (Throwable)e);
                    }
                }, errore -> Log.e((String)TAG, (String)"cattura non riuscita", (Throwable)errore));
                break;
            }
            case "installUpdate": {
                this.installaAggiornamento(MainActivity.argomento(args, 0));
                break;
            }
            case "requestMic": {
                if (this.checkSelfPermission("android.permission.RECORD_AUDIO") == 0) {
                    this.inviaEvento("mic.result", true);
                    break;
                }
                this.unPermessoAllaVolta(() -> this.requestPermissions(new String[]{"android.permission.RECORD_AUDIO"}, 4711));
                break;
            }
            case "saveDownload": {
                String esito = "";
                try {
                    String nomeFile = args.length > 0 ? String.valueOf(args[0]) : "nova.json";
                    String base64 = args.length > 1 ? String.valueOf(args[1]) : "";
                    byte[] bytes = Base64.decode((String)base64, (int)0);
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues cv = new ContentValues();
                        cv.put("_display_name", nomeFile);
                        cv.put("mime_type", "application/json");
                        cv.put("is_pending", Integer.valueOf(1));
                        Uri uri = this.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (uri == null) {
                            throw new IOException("MediaStore insert nullo");
                        }
                        OutputStream out = this.getContentResolver().openOutputStream(uri);
                        out.write(bytes);
                        out.close();
                        cv.clear();
                        cv.put("is_pending", Integer.valueOf(0));
                        this.getContentResolver().update(uri, cv, null, null);
                        esito = "Download/" + nomeFile;
                    } else {
                        File dir = Environment.getExternalStoragePublicDirectory((String)Environment.DIRECTORY_DOWNLOADS);
                        if (!dir.exists()) {
                            dir.mkdirs();
                        }
                        File f = new File(dir, nomeFile);
                        FileOutputStream fo = new FileOutputStream(f);
                        fo.write(bytes);
                        fo.close();
                        esito = f.getAbsolutePath();
                    }
                    Toast.makeText((Context)this, (CharSequence)"File salvato in Download", (int)0).show();
                }
                catch (Exception e) {
                    Log.e((String)TAG, (String)"saveDownload non riuscito", (Throwable)e);
                    Toast.makeText((Context)this, (CharSequence)"Salvataggio non riuscito", (int)0).show();
                }
                this.inviaRisposta(idRichiesta, esito);
                break;
            }
            case "openAppSettings": {
                try {
                    Intent i = new Intent("android.settings.APPLICATION_DETAILS_SETTINGS", Uri.fromParts((String)"package", (String)this.getPackageName(), null));
                    i.addFlags(0x10000000);
                    this.startActivity(i);
                }
                catch (Exception e) {
                    Log.w((String)TAG, (String)"impostazioni app non apribili", (Throwable)e);
                }
                break;
            }
            case "shellStageBegin": {
                try {
                    this.deleteRecursively(this.stageDir());
                    if (this.stageDir().mkdirs() || this.stageDir().isDirectory()) break;
                    Log.w((String)TAG, (String)("staging non creabile: " + this.stageDir().getAbsolutePath()));
                }
                catch (Exception e) {
                    Log.w((String)TAG, (String)"staging non ripulita", (Throwable)e);
                }
                break;
            }
            case "shellWrite": {
                String rel = args.length > 0 ? String.valueOf(args[0]) : null;
                String b64 = args.length > 1 ? String.valueOf(args[1]) : null;
                boolean ok = this.scriviInStaging(rel, b64);
                if (!ok) {
                    Log.w((String)TAG, (String)("file rifiutato dalla staging: " + rel));
                }
                this.inviaRisposta(idRichiesta, ok);
                break;
            }
            case "shellCommit": {
                boolean ok = this.committaStaging();
                this.inviaRisposta(idRichiesta, ok);
                if (!ok) break;
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    Log.i((String)TAG, (String)"ricarico la shell dopo il commit");
                    if (this.session != null) {
                        this.session.reload();
                    }
                }, 400L);
                break;
            }
            case "shellReset": {
                this.deleteRecursively(new File(this.getFilesDir(), "shell"));
                this.deleteRecursively(this.stageDir());
                File ripristinata = this.preparaShell();
                Log.i((String)TAG, (String)("shell ripristinata dagli asset: " + (ripristinata != null)));
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    if (this.session != null) {
                        this.session.reload();
                    }
                }, 200L);
                break;
            }
            default: {
                Log.i((String)TAG, (String)("comando riconosciuto ma non ancora cablato: " + nome));
                if (idRichiesta < 0) break;
                Log.w((String)TAG, (String)("richiesta senza risposta cablata: " + nome + " \u2014 rispondo null per non lasciare la pagina appesa"));
                this.inviaRisposta(idRichiesta, null);
            }
        }
    }

    private String copyShellToInternalAndGetUrl() {
        File dir = this.preparaShell();
        if (dir == null) {
            return ASSET_INDEX;
        }
        return "file://" + new File(dir, "index.html").getAbsolutePath();
    }

    private File stageDir() {
        return new File(this.getFilesDir(), "shell_stage");
    }

    private File preparaShell() {
        File dir = new File(this.getFilesDir(), "shell");
        int interna = this.buildDi(new File(dir, "version.json"));
        int asset = this.buildDegliAsset();
        if (interna >= 0 && interna > asset && new File(dir, "index.html").isFile()) {
            Log.i((String)TAG, (String)("shell interna tenuta: build " + interna + " > asset " + asset));
            return dir;
        }
        try {
            this.deleteRecursively(dir);
            this.copyAsset(ASSET_SHELL, dir);
            File index = new File(dir, "index.html");
            Log.i((String)TAG, (String)("shell dagli asset (interna=" + interna + " asset=" + asset + "): " + index.getAbsolutePath() + " eFile=" + index.isFile()));
            return index.isFile() ? dir : null;
        }
        catch (Exception e) {
            Log.e((String)TAG, (String)"copia in storage interno fallita: ripiego sugli asset", (Throwable)e);
            return null;
        }
    }

    private int buildDi(File versionJson) {
        try {
            byte[] b = new byte[(int)versionJson.length()];
            try (FileInputStream in = new FileInputStream(versionJson);){
                int n;
                for (int letti = 0; letti < b.length && (n = ((InputStream)in).read(b, letti, b.length - letti)) > 0; letti += n) {
                }
            }
            return this.parseBuild(new String(b, "UTF-8"));
        }
        catch (Exception e) {
            return -1;
        }
    }

    private int buildDegliAsset() {
        int n;
        block9: {
            InputStream in = this.getAssets().open("www/version.json");
            try {
                int n2;
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                while ((n2 = in.read(buf)) > 0) {
                    bo.write(buf, 0, n2);
                }
                n = this.parseBuild(bo.toString("UTF-8"));
                if (in == null) break block9;
            }
            catch (Throwable throwable) {
                try {
                    if (in != null) {
                        try {
                            in.close();
                        }
                        catch (Throwable throwable2) {
                            throwable.addSuppressed(throwable2);
                        }
                    }
                    throw throwable;
                }
                catch (Exception e) {
                    return -1;
                }
            }
            in.close();
        }
        return n;
    }

    private int parseBuild(String json) {
        try {
            Matcher m = Pattern.compile("\"build\"\\s*:\\s*(\\d+)").matcher(json);
            if (m.find()) {
                return Integer.parseInt(m.group(1));
            }
        }
        catch (Exception exception) {
            // empty catch block
        }
        return -1;
    }

    private boolean scriviInStaging(String rel, String base64) {
        try {
            if (rel == null || base64 == null) {
                return false;
            }
            if ((rel = rel.replace("\\", "/")).contains("..") || rel.startsWith("/")) {
                return false;
            }
            File out = new File(this.stageDir(), rel);
            if (!out.getCanonicalPath().startsWith(this.stageDir().getCanonicalPath())) {
                return false;
            }
            File parent = out.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                return false;
            }
            byte[] dati = Base64.decode((String)base64, (int)0);
            try (FileOutputStream fo = new FileOutputStream(out);){
                ((OutputStream)fo).write(dati);
            }
            return true;
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)("scrittura in staging fallita: " + rel), (Throwable)e);
            return false;
        }
    }

    private boolean committaStaging() {
        File stage = this.stageDir();
        File dir = new File(this.getFilesDir(), "shell");
        if (!new File(stage, "index.html").isFile() || !new File(stage, "version.json").isFile()) {
            Log.w((String)TAG, (String)("commit rifiutato: staging incompleta in " + stage.getAbsolutePath()));
            return false;
        }
        this.deleteRecursively(dir);
        if (!stage.renameTo(dir)) {
            Log.e((String)TAG, (String)("commit fallito: la staging non \u00e8 stata spostata in " + dir.getAbsolutePath() + " \u2014 al prossimo avvio si riparte dagli asset"));
            return false;
        }
        Log.i((String)TAG, (String)("commit eseguito: shell sostituita, build " + this.buildDi(new File(dir, "version.json"))));
        return true;
    }

    private void copyAsset(String assetPath, File dest) throws Exception {
        try (InputStream in2 = this.getAssets().open(assetPath);){
            this.copyStreamToFile(in2, dest);
            return;
        }
        catch (IOException in2) {
            String[] children = this.getAssets().list(assetPath);
            if (!dest.exists() && !dest.mkdirs()) {
                throw new Exception("mkdirs fallita: " + dest);
            }
            if (children == null) {
                return;
            }
            for (String child : children) {
                this.copyAsset(assetPath + "/" + child, new File(dest, child));
            }
            return;
        }
    }

    private void copyStreamToFile(InputStream in, File dest) throws Exception {
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new Exception("mkdirs fallita: " + parent);
        }
        try (FileOutputStream out = new FileOutputStream(dest);){
            int n;
            byte[] buf = new byte[8192];
            while ((n = in.read(buf)) > 0) {
                ((OutputStream)out).write(buf, 0, n);
            }
        }
    }

    private void deleteRecursively(File f) {
        File[] children;
        if (f == null || !f.exists()) {
            return;
        }
        if (f.isDirectory() && (children = f.listFiles()) != null) {
            for (File child : children) {
                this.deleteRecursively(child);
            }
        }
        f.delete();
    }

    private void immersive() {
        this.getWindow().addFlags(128);
        this.getWindow().getDecorView().setSystemUiVisibility(5894);
    }

    protected void onResume() {
        super.onResume();
        CallHub.setActivity(this);
        this.ripubblicaStato();
    }

    public void onBackPressed() {
        if (this.portaNativa != null) {
            this.inviaEvento("back", new Object[0]);
            return;
        }
        super.onBackPressed();
    }

    protected void onDestroy() {
        if (this.ricevitoreSensori != null) {
            try {
                this.unregisterReceiver(this.ricevitoreSensori);
            }
            catch (Exception exception) {
                // empty catch block
            }
            this.ricevitoreSensori = null;
        }
        this.rimandoStato.removeCallbacks(this.mandaStato);
        if (this.callbackTorcia != null) {
            try {
                CameraManager cm = (CameraManager)this.getSystemService("camera");
                if (cm != null) {
                    cm.unregisterTorchCallback(this.callbackTorcia);
                }
            }
            catch (Exception exception) {
                // empty catch block
            }
            this.callbackTorcia = null;
        }
        if (this.server != null) {
            this.server.ferma();
            this.server = null;
        }
        if (this.session != null) {
            this.session.close();
            this.session = null;
        }
        super.onDestroy();
    }

    private class PermessiMedia
    implements GeckoSession.PermissionDelegate {
        private PermessiMedia() {
        }

        public void onMediaPermissionRequest(GeckoSession sessione, String uri, GeckoSession.PermissionDelegate.MediaSource[] video, GeckoSession.PermissionDelegate.MediaSource[] audio, GeckoSession.PermissionDelegate.MediaCallback callback) {
            Log.i((String)MainActivity.TAG, (String)("la pagina chiede i media: video=" + (video != null && video.length > 0) + " audio=" + (audio != null && audio.length > 0)));
            if (MainActivity.this.mediaInAttesa != null) {
                Log.w((String)MainActivity.TAG, (String)"richiesta media gi\u00e0 in corso: rifiuto la seconda");
                callback.reject();
                return;
            }
            MainActivity.this.mediaInAttesa = callback;
            MainActivity.this.videoInAttesa = video;
            MainActivity.this.audioInAttesa = audio;
            MainActivity.this.unPermessoAllaVolta(this::chiediAdesso);
        }

        private void chiediAdesso() {
            if (MainActivity.this.mediaInAttesa == null) {
                MainActivity.this.turnoSuccessivoDeiPermessi();
                return;
            }
            boolean vuoleVideo = MainActivity.this.videoInAttesa != null && MainActivity.this.videoInAttesa.length > 0;
            boolean vuoleAudio = MainActivity.this.audioInAttesa != null && MainActivity.this.audioInAttesa.length > 0;
            ArrayList<String> mancanti = new ArrayList<String>();
            if (vuoleAudio && MainActivity.this.checkSelfPermission("android.permission.RECORD_AUDIO") != 0) {
                mancanti.add("android.permission.RECORD_AUDIO");
            }
            if (vuoleVideo && MainActivity.this.checkSelfPermission("android.permission.CAMERA") != 0) {
                mancanti.add("android.permission.CAMERA");
            }
            if (mancanti.isEmpty()) {
                Log.i((String)MainActivity.TAG, (String)"media gi\u00e0 consentiti: concedo senza un secondo dialogo");
                MainActivity.this.rispondiAllaRichiestaMedia(true);
                MainActivity.this.turnoSuccessivoDeiPermessi();
                return;
            }
            MainActivity.this.requestPermissions(mancanti.toArray(new String[0]), 4712);
        }
    }

    private class PortMessages
    implements WebExtension.PortDelegate {
        private PortMessages() {
        }

        public void onPortMessage(Object message, WebExtension.Port port) {
            Log.i((String)MainActivity.TAG, (String)("messaggio sulla porta nativa: " + message));
        }

        public void onDisconnect(WebExtension.Port port) {
            Log.i((String)MainActivity.TAG, (String)"porta nativa chiusa dall'estensione");
            if (MainActivity.this.portaNativa == port) {
                MainActivity.this.portaNativa = null;
            }
        }
    }

    private class BridgeMessages
    implements WebExtension.MessageDelegate {
        private BridgeMessages() {
        }

        public GeckoResult<Object> onMessage(String nativeApp, Object message, WebExtension.MessageSender sender) {
            String nome = null;
            Object[] args = new Object[]{};
            int idRichiesta = -1;
            if (message instanceof GeckoBundle) {
                GeckoBundle b = (GeckoBundle)message;
                nome = b.getString("nova");
                a = b.get("args");
                if (a instanceof Object[]) {
                    args = (Object[])a;
                } else if (a instanceof List) {
                    args = ((List)a).toArray();
                } else if (a != null) {
                    args = new Object[]{a};
                }
            } else if (message instanceof JSONObject) {
                JSONObject o = (JSONObject)message;
                nome = o.optString("nova", null);
                idRichiesta = o.optInt("id", -1);
                a = o.optJSONArray("args");
                if (a != null) {
                    args = new Object[a.length()];
                    for (int i = 0; i < a.length(); ++i) {
                        args[i] = a.opt(i);
                    }
                }
            } else if (message instanceof Map) {
                Object a;
                Map m = (Map)message;
                Object n = m.get("nova");
                if (n != null) {
                    nome = String.valueOf(n);
                }
                if ((a = m.get("args")) instanceof Object[]) {
                    args = (Object[])a;
                } else if (a instanceof List) {
                    args = ((List)a).toArray();
                }
            } else if (message != null) {
                Log.w((String)MainActivity.TAG, (String)("messaggio di tipo inatteso: " + message.getClass().getName() + " valore=" + message));
            }
            String ambiente = "?";
            if (sender != null) {
                ambiente = sender.environmentType == 2 ? "content-script" : "estensione";
            }
            Log.i((String)MainActivity.TAG, (String)("comando dal ponte: " + nome + " (" + args.length + " argomenti)" + (idRichiesta >= 0 ? " id=" + idRichiesta : "") + " ambiente=" + ambiente + " da=" + (sender == null ? "?" : sender.url)));
            if (nome == null) {
                return GeckoResult.fromValue(null);
            }
            if ("__pagina_pronta".equals(nome)) {
                MainActivity.this.inviaStatoAllaShell();
            }
            String n2 = nome;
            Object[] a2 = args;
            int id2 = idRichiesta;
            MainActivity.this.runOnUiThread(() -> MainActivity.this.esegui(n2, a2, id2));
            return GeckoResult.fromValue(null);
        }

        public void onConnect(WebExtension.Port port) {
            Log.i((String)MainActivity.TAG, (String)("porta nativa aperta: nome=" + port.name + " da=" + (port.sender == null ? "?" : port.sender.url)));
            MainActivity.this.portaNativa = port;
            port.setDelegate((WebExtension.PortDelegate)new PortMessages());
        }
    }
}

