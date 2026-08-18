package os.nova.launcher;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.role.RoleManager;
import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Environment;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.wifi.WifiManager;
import android.nfc.NfcAdapter;
import android.provider.Settings;
import android.telecom.Call;
import android.telecom.TelecomManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * NovaOS launcher: una singola Activity a schermo intero che ospita la
 * web shell dentro una WebView. Registrata come HOME nel manifest, sostituisce
 * il launcher di sistema. Le "app" sono web app caricate dalla shell stessa.
 *
 * In sviluppo carica dal server host (http://10.0.2.2:8080); in produzione
 * carica gli asset locali impacchettati in assets/www (SO autonomo/offline).
 */
public class MainActivity extends Activity {

    // Sviluppo: shell servita dall'host (python -m http.server 8080/8091).
    // Produzione: shell impacchettata negli assets (SO autonomo/offline).
    private static final boolean DEV = false;
    private static final String DEV_URL  = "http://10.0.2.2:8091/index.html";
    private static final String PROD_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private MailBridge mail;

    // selezione file dai campi <input type="file"> della shell (foto rubrica, import galleria…)
    private android.webkit.ValueCallback<android.net.Uri[]> filePathCallback;
    private static final int REQ_FILE = 7;

    /** Esegue JS nella WebView dal thread UI (usato dai callback di rete della Mail). */
    void evalJs(String js) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); }); }

    /** Al ritorno in primo piano (es. dopo le Impostazioni app) riacquisisce il microfono
     *  nella Fotocamera se ora è concesso. */
    @Override protected void onResume() {
        super.onResume();
        if (web != null && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
            evalJs("window.__novaMicResume && window.__novaMicResume()");
    }

    /** Esito richieste permessi: avvisa la shell quando il microfono è concesso. */
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 4) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            evalJs("window.__novaMic && window.__novaMic(" + (ok ? "true" : "false") + ")");
        }
    }

    /** Consegna alla WebView il file scelto dal selettore di sistema (input type=file). */
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (filePathCallback == null) { super.onActivityResult(requestCode, resultCode, data); return; }
            android.net.Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    results = new android.net.Uri[n];
                    for (int i = 0; i < n; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    results = new android.net.Uri[]{ data.getData() };
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ============================================================
    //  Aggiornamento OTA della SOLA interfaccia (shell HTML/JS/CSS) senza reinstallare
    //  l'APK. La shell può vivere in una cartella scrivibile interna (files/shell/): se
    //  contiene una build più recente di quella impacchettata negli asset, viene caricata
    //  da lì. L'updater JS scarica i file, li scrive in staging (files/shell_stage/) e poi
    //  fa il commit atomico (rename). Stesso meccanismo riutilizzabile nella ROM finale,
    //  dove la shell risiederà in una directory di sistema dedicata invece che nell'APK.
    // ============================================================
    private java.io.File shellDir() { return new java.io.File(getFilesDir(), "shell"); }
    private java.io.File stageDir() { return new java.io.File(getFilesDir(), "shell_stage"); }

    private int parseBuild(String json) {
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"build\"\\s*:\\s*(\\d+)").matcher(json);
            if (m.find()) return Integer.parseInt(m.group(1));
        } catch (Exception e) {}
        return -1;
    }
    private int fileBuild(java.io.File versionJson) {
        try {
            byte[] b = new byte[(int) versionJson.length()];
            java.io.FileInputStream in = new java.io.FileInputStream(versionJson);
            int off = 0, n; while (off < b.length && (n = in.read(b, off, b.length - off)) > 0) off += n;
            in.close();
            return parseBuild(new String(b, "UTF-8"));
        } catch (Exception e) { return -1; }
    }
    private int assetBuild() {
        try {
            java.io.InputStream in = getAssets().open("www/version.json");
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            return parseBuild(bo.toString("UTF-8"));
        } catch (Exception e) { return 0; }
    }
    /** URL da cui caricare la shell: interna se più recente degli asset, altrimenti asset. */
    private String resolveShellUrl() {
        if (DEV) return DEV_URL;
        try {
            java.io.File idx = new java.io.File(shellDir(), "index.html");
            java.io.File ver = new java.io.File(shellDir(), "version.json");
            if (idx.exists() && ver.exists() && fileBuild(ver) > assetBuild())
                return "file://" + idx.getAbsolutePath();
        } catch (Exception e) {}
        return PROD_URL;   // fallback sicuro: la shell dell'APK non viene mai persa
    }
    private void deleteRec(java.io.File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) { java.io.File[] ch = f.listFiles(); if (ch != null) for (java.io.File c : ch) deleteRec(c); }
        f.delete();
    }
    /** Scrive un file nella staging, bloccando ogni path-traversal fuori da shell_stage/. */
    private boolean writeStageFile(String rel, String base64) {
        try {
            if (rel == null) return false;
            rel = rel.replace("\\", "/");
            if (rel.contains("..") || rel.startsWith("/")) return false;
            java.io.File out = new java.io.File(stageDir(), rel);
            if (!out.getCanonicalPath().startsWith(stageDir().getCanonicalPath())) return false;
            java.io.File parent = out.getParentFile(); if (parent != null) parent.mkdirs();
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            java.io.FileOutputStream fo = new java.io.FileOutputStream(out);
            fo.write(data); fo.close();
            return true;
        } catch (Exception e) { return false; }
    }
    /** Commit atomico: valida la staging, sostituisce shell/ e ricarica da lì. */
    private boolean commitStage() {
        java.io.File stage = stageDir();
        if (!new java.io.File(stage, "index.html").exists() || !new java.io.File(stage, "version.json").exists()) return false;
        deleteRec(shellDir());
        return stage.renameTo(shellDir());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // schermo intero, senza barra del titolo
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                             WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);            // localStorage per lo stato di NovaOS
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // niente apertura nel browser esterno: tutto resta nella shell
        web.setWebViewClient(new WebViewClient());

        // concede alla shell i permessi web richiesti (es. fotocamera per getUserMedia)
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] res = request.getResources();
                    boolean wantsAudio = false;
                    for (String r : res) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsAudio = true;
                    // se il sito chiede il microfono ma manca il permesso Android, chiedilo
                    // ora (dialog di sistema) e nega questa richiesta: la app riproverà
                    // appena il permesso è concesso (window.__novaMic).
                    if (wantsAudio && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{ android.Manifest.permission.RECORD_AUDIO }, 4);
                        try { request.deny(); } catch (Exception e) {}
                        return;
                    }
                    request.grant(res);
                });
            }
            // apre il selettore file di sistema per i campi <input type="file"> della shell
            @Override public boolean onShowFileChooser(WebView view,
                    android.webkit.ValueCallback<android.net.Uri[]> cb,
                    WebChromeClient.FileChooserParams params) {
                if (filePathCallback != null) { filePathCallback.onReceiveValue(null); }
                filePathCallback = cb;
                Intent intent;
                try { intent = params.createIntent(); }
                catch (Exception e) { intent = new Intent(Intent.ACTION_GET_CONTENT); intent.setType("*/*"); intent.addCategory(Intent.CATEGORY_OPENABLE); }
                if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(intent, "Seleziona"), REQ_FILE); }
                catch (Exception e) { filePathCallback = null; return false; }
                return true;
            }
        });

        // ponte email reale (SMTP/IMAP via JavaMail)
        mail = new MailBridge(getApplicationContext(), this::evalJs);

        // ponte JS <-> Android: espone l'hardware reale alle web app come window.NovaNative
        web.addJavascriptInterface(new NovaBridge(), "NovaNative");

        // richiede a runtime i permessi che servono per le funzioni reali:
        // CALL_PHONE abilita la chiamata DIRETTA (ACTION_CALL) invece del dialer.
        java.util.List<String> need = new java.util.ArrayList<>();
        for (String p : new String[]{ android.Manifest.permission.CALL_PHONE, android.Manifest.permission.CAMERA, android.Manifest.permission.RECORD_AUDIO }) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        // Android 12+: leggere/gestire il Bluetooth richiede il permesso runtime BLUETOOTH_CONNECT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                need.add(android.Manifest.permission.BLUETOOTH_CONNECT);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);

        // collega la schermata di chiamata e chiede di diventare telefono predefinito
        CallHub.setActivity(this);
        requestDefaultDialer();

        immersive();
        web.loadUrl(resolveShellUrl());   // shell interna (aggiornata OTA) o quella dell'APK
    }

    /** Chiede a NovaOS di diventare l'app telefono predefinita (serve per l'InCallService). */
    private void requestDefaultDialer() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager rm = getSystemService(RoleManager.class);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_DIALER) && !rm.isRoleHeld(RoleManager.ROLE_DIALER)) {
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_DIALER), 2);
            }
        } else {
            Intent i = new Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
                    .putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, getPackageName());
            try { startActivity(i); } catch (Exception ignored) {}
        }
    }

    /** Invia alla shell lo stato della chiamata corrente (chiamato da CallHub/InCallService). */
    public void pushCall() {
        runOnUiThread(() -> {
            if (web == null) return;
            Call c = CallHub.call;
            String js;
            if (c == null) {
                js = "window.NovaCall&&NovaCall.update('ended','','')";
            } else {
                String num = "";
                try { num = c.getDetails().getHandle().getSchemeSpecificPart(); } catch (Exception e) {}
                String state;
                switch (c.getState()) {
                    case Call.STATE_RINGING: state = "incoming"; break;
                    case Call.STATE_DIALING:
                    case Call.STATE_CONNECTING: state = "dialing"; break;
                    case Call.STATE_ACTIVE: state = "active"; break;
                    case Call.STATE_DISCONNECTED: state = "ended"; break;
                    default: state = "active";
                }
                js = "window.NovaCall&&NovaCall.update('" + state + "','" + num + "','')";
            }
            web.evaluateJavascript(js, null);
        });
    }

    /**
     * Bridge nativo: ogni metodo @JavascriptInterface è chiamabile dalla shell
     * come window.NovaNative.<metodo>(). È qui che il "web" tocca l'hardware reale.
     */
    public class NovaBridge {

        /** Chiamata telefonica reale. Con permesso CALL_PHONE compone direttamente;
         *  senza permesso apre il dialer di sistema precompilato (ACTION_DIAL). */
        @JavascriptInterface
        public void call(String number) {
            Uri uri = Uri.parse("tel:" + number);
            boolean canCall = checkSelfPermission(android.Manifest.permission.CALL_PHONE)
                    == PackageManager.PERMISSION_GRANTED;
            Intent i = new Intent(canCall ? Intent.ACTION_CALL : Intent.ACTION_DIAL, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        }

        /** Invia un SMS tramite l'app di messaggistica di sistema. */
        @JavascriptInterface
        public void sms(String number, String body) {
            Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + number));
            i.putExtra("sms_body", body == null ? "" : body);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        }

        /** Invia direttamente un SMS (senza aprire altre app) usando SmsManager.
         *  Richiede il permesso SEND_SMS; se manca, lo chiede e ripiega sull'app SMS. */
        @JavascriptInterface
        public void sendSms(String number, String body) {
            if (number == null || number.isEmpty()) return;
            if (checkSelfPermission(android.Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{ android.Manifest.permission.SEND_SMS }, 3));
                sms(number, body);   // intanto apre l'app SMS come ripiego
                return;
            }
            try {
                android.telephony.SmsManager sm = android.telephony.SmsManager.getDefault();
                java.util.ArrayList<String> parts = sm.divideMessage(body == null ? "" : body);
                sm.sendMultipartTextMessage(number, null, parts, null, null);
            } catch (Exception e) {
                sms(number, body);   // se qualcosa va storto, ripiega sull'app SMS
            }
        }

        /** Livello batteria reale (0-100). */
        @JavascriptInterface
        public int batteryLevel() {
            BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
            return bm == null ? -1 : bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        }

        /** Vibrazione reale (millisecondi). */
        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(ms);
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        // controllo della chiamata dalla schermata web di NovaOS
        @JavascriptInterface public void callAnswer()          { CallHub.answer(); }
        @JavascriptInterface public void callHangup()          { CallHub.hangup(); }
        @JavascriptInterface public void callMute(boolean m)   { CallHub.mute(m); }
        @JavascriptInterface public void callSpeaker(boolean s){ CallHub.speaker(s); }
        @JavascriptInterface public void callDtmf(String s)    { CallHub.dtmf(s); }

        // microfono: la Fotocamera lo richiede a runtime prima di registrare un video,
        // così l'audio è già concesso quando parte la registrazione (video con suono).
        @JavascriptInterface public boolean micReady() {
            return checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        @JavascriptInterface public boolean micGranted() {
            return checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        // stato del permesso microfono: "granted" | "askable" (negato, ridomandabile)
        // | "blocked" (mai chiesto o negato per sempre -> serve Impostazioni)
        @JavascriptInterface public String micDiag() {
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return "granted";
            boolean rationale = false;
            try { rationale = shouldShowRequestPermissionRationale(android.Manifest.permission.RECORD_AUDIO); } catch (Exception e) {}
            return rationale ? "askable" : "blocked";
        }
        @JavascriptInterface public void requestMic() {
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                runOnUiThread(() -> requestPermissions(new String[]{ android.Manifest.permission.RECORD_AUDIO }, 4));
        }
        // apre la scheda dell'app nelle Impostazioni di sistema (per riattivare a mano
        // il microfono quando il permesso è stato negato "per sempre").
        @JavascriptInterface public void openAppSettings() {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {}
        }

        // apre un URL nel browser nativo a schermo intero (niente limiti iframe)
        @JavascriptInterface public void openBrowser(String url) {
            Intent i = new Intent(MainActivity.this, BrowserActivity.class);
            i.putExtra("url", url);
            startActivity(i);
        }

        /** Condivide un'immagine (data URL) verso altre app col chooser di sistema. */
        @JavascriptInterface public void shareImage(String dataUrl) {
            try {
                int comma = dataUrl.indexOf(',');
                String meta = dataUrl.substring(dataUrl.indexOf(':') + 1, comma); // es. image/jpeg;base64
                String mime = meta.split(";")[0];
                byte[] bytes = android.util.Base64.decode(dataUrl.substring(comma + 1), android.util.Base64.DEFAULT);
                java.io.File dir = new java.io.File(getCacheDir(), "share");
                dir.mkdirs();
                String ext = mime.contains("png") ? ".png" : ".jpg";
                java.io.File f = new java.io.File(dir, "novaos-" + System.currentTimeMillis() + ext);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(f);
                fos.write(bytes); fos.close();
                Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + f.getName());
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                // ClipData: indispensabile perché il permesso di lettura dell'URI arrivi
                // davvero all'app scelta nel chooser (altrimenti riceve l'immagine ma non
                // può aprirla → la condivisione "non funziona").
                send.setClipData(ClipData.newUri(getContentResolver(), "foto", uri));
                Intent chooser = Intent.createChooser(send, "Condividi foto");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(chooser);
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Condivisione non riuscita", Toast.LENGTH_SHORT).show());
            }
        }

        /** Condivide testo/URL (usato da Note, Browser, ecc.). */
        @JavascriptInterface public void shareText(String text) {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            Intent chooser = Intent.createChooser(send, "Condividi");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(chooser);
        }

        // ============================================================
        //  Sensori / connettività REALI
        //  Nota: da Android 10 le app NON possono accendere/spegnere in
        //  silenzio Wi-Fi, Bluetooth, dati, aereo ecc. (scelta di sicurezza
        //  del sistema). La via ufficiale è aprire il pannello rapido/di
        //  sistema, che qui invochiamo davvero; lo stato letto è quello VERO
        //  dell'hardware, non una simulazione.
        // ============================================================

        /** Stato reale di tutti i sensori/connettività, come JSON. */
        @JavascriptInterface
        public String sensorStates() {
            StringBuilder b = new StringBuilder("{");
            b.append("\"wifi\":").append(readWifi());
            b.append(",\"bt\":").append(readBt());
            b.append(",\"nfc\":").append(readNfc());
            b.append(",\"location\":").append(readLocation());
            b.append(",\"airplane\":").append(readAirplane());
            b.append(",\"mobileData\":").append(readMobileData());
            b.append(",\"privileged\":").append(privilegedNative());   // true nel ROM (app di sistema)
            b.append(",\"native\":true}");
            return b.toString();
        }

        /** true se NovaOS ha poteri di sistema (firma di piattaforma / priv-app nel ROM
         *  definitivo): WRITE_SECURE_SETTINGS non è concedibile a un'app normale, quindi è
         *  una spia affidabile del fatto che possiamo commutare i sensori in-process. */
        private boolean privilegedNative() {
            try { return checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") == PackageManager.PERMISSION_GRANTED; }
            catch (Exception e) { return false; }
        }
        /** Esposto al web: capacità reali del bridge su questo dispositivo. */
        @JavascriptInterface public boolean privileged() { return privilegedNative(); }

        private boolean readMobileData() {
            try { android.telephony.TelephonyManager tm = (android.telephony.TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
                  java.lang.reflect.Method m = tm.getClass().getMethod("isDataEnabled");
                  Object r = m.invoke(tm); return r instanceof Boolean && (Boolean) r; }
            catch (Exception e) { return false; }
        }

        private boolean readWifi() {
            try { WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                  return wm != null && wm.isWifiEnabled(); } catch (Exception e) { return false; }
        }
        private boolean readBt() {
            try { BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter(); return a != null && a.isEnabled(); }
            catch (Exception e) { return false; }
        }
        private boolean readNfc() {
            try { NfcAdapter a = NfcAdapter.getDefaultAdapter(MainActivity.this); return a != null && a.isEnabled(); }
            catch (Exception e) { return false; }
        }
        private boolean readLocation() {
            try { LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                  if (lm == null) return false;
                  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return lm.isLocationEnabled();
                  return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                      || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); }
            catch (Exception e) { return false; }
        }
        private boolean readAirplane() {
            try { return Settings.Global.getInt(getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, 0) != 0; }
            catch (Exception e) { return false; }
        }

        // ============================================================
        //  Toggle "reali" dei sensori. Ogni metodo restituisce true se ha
        //  cambiato lo stato DAVVERO e in-process (nessuna UI esterna); false
        //  se ha dovuto delegare al pannello di sistema (app non privilegiata).
        //  → Stesso APK: da app normale apre i pannelli; nel ROM definitivo
        //    (privilegiato) commuta direttamente, senza uscire da NovaOS.
        // ============================================================

        /** Wi-Fi: diretto se privilegiato o Android < 10; altrimenti pannello. */
        @JavascriptInterface
        public boolean setWifi(boolean on) {
            try {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || privilegedNative())) {
                    wm.setWifiEnabled(on); toast(on ? "Wi-Fi attivato" : "Wi-Fi disattivato"); return true;
                }
            } catch (Exception ignored) {}
            openSetting("wifi");
            return false;
        }

        /** Bluetooth: diretto se privilegiato o Android < 13; altrimenti richiesta/pannello. */
        @JavascriptInterface
        public boolean setBluetooth(boolean on) {
            try {
                BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
                if (a == null) { toast("Bluetooth non disponibile"); return false; }
                if (privilegedNative() || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                    boolean ok = on ? a.enable() : a.disable();   // deprecato ma valido da sistema o < API 33
                    if (ok) { toast(on ? "Attivo il Bluetooth…" : "Disattivo il Bluetooth…"); return true; }
                }
            } catch (Exception ignored) {}
            if (on) {
                launch(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "Attivazione Bluetooth");
                return false;
            }
            openSetting("bluetooth");
            return false;
        }

        /** Modalità aereo: diretto solo se privilegiato (WRITE_SECURE_SETTINGS). */
        @JavascriptInterface
        public boolean setAirplane(boolean on) {
            if (privilegedNative()) {
                try {
                    Settings.Global.putInt(getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, on ? 1 : 0);
                    sendBroadcast(new Intent(Intent.ACTION_AIRPLANE_MODE_CHANGED).putExtra("state", on));
                    toast(on ? "Modalità aereo attiva" : "Modalità aereo disattivata"); return true;
                } catch (Exception ignored) {}
            }
            openSetting("airplane");
            return false;
        }

        /** Posizione (GPS): diretto solo se privilegiato. */
        @JavascriptInterface
        public boolean setLocation(boolean on) {
            if (privilegedNative()) {
                try {
                    Settings.Secure.putInt(getContentResolver(), Settings.Secure.LOCATION_MODE,
                        on ? Settings.Secure.LOCATION_MODE_HIGH_ACCURACY : Settings.Secure.LOCATION_MODE_OFF);
                    toast(on ? "Posizione attivata" : "Posizione disattivata"); return true;
                } catch (Exception ignored) {}
            }
            openSetting("location");
            return false;
        }

        /** NFC: diretto solo se privilegiato (API @hide via reflection). */
        @JavascriptInterface
        public boolean setNfc(boolean on) {
            if (privilegedNative()) {
                try {
                    NfcAdapter a = NfcAdapter.getDefaultAdapter(MainActivity.this);
                    if (a != null) {
                        java.lang.reflect.Method m = NfcAdapter.class.getDeclaredMethod(on ? "enable" : "disable");
                        m.setAccessible(true); m.invoke(a);
                        toast(on ? "NFC attivato" : "NFC disattivato"); return true;
                    }
                } catch (Exception ignored) {}
            }
            openSetting("nfc");
            return false;
        }

        /** Dati mobili: diretto solo se privilegiato (MODIFY_PHONE_STATE, via reflection). */
        @JavascriptInterface
        public boolean setMobileData(boolean on) {
            if (privilegedNative()) {
                try {
                    android.telephony.TelephonyManager tm = (android.telephony.TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
                    java.lang.reflect.Method m = tm.getClass().getDeclaredMethod("setDataEnabled", boolean.class);
                    m.setAccessible(true); m.invoke(tm, on);
                    toast(on ? "Dati mobili attivi" : "Dati mobili disattivati"); return true;
                } catch (Exception ignored) {}
            }
            openSetting("data");
            return false;
        }

        /** Apre il pannello/impostazione di sistema per un sensore (sul thread UI). */
        @JavascriptInterface
        public void openSetting(String which) {
            Intent i = new Intent();
            String label;
            switch (which) {
                case "wifi":
                    i.setAction(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? Settings.Panel.ACTION_WIFI : Settings.ACTION_WIFI_SETTINGS);
                    label = "Wi-Fi"; break;
                case "bluetooth": i.setAction(Settings.ACTION_BLUETOOTH_SETTINGS); label = "Bluetooth"; break;
                case "airplane":  i.setAction(Settings.ACTION_AIRPLANE_MODE_SETTINGS); label = "Modalità aereo"; break;
                case "nfc":       i.setAction(Settings.ACTION_NFC_SETTINGS); label = "NFC"; break;
                case "location":  i.setAction(Settings.ACTION_LOCATION_SOURCE_SETTINGS); label = "Posizione"; break;
                case "data":      i.setAction(Settings.ACTION_DATA_ROAMING_SETTINGS); label = "Dati mobili"; break;
                case "hotspot":   i.setClassName("com.android.settings", "com.android.settings.TetherSettings");
                                  label = "Hotspot"; break;
                case "date":      i.setAction(Settings.ACTION_DATE_SETTINGS); label = "Data e ora"; break;
                case "locale":    i.setAction(Settings.ACTION_LOCALE_SETTINGS); label = "Lingua"; break;
                case "appdetails":
                    i.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                     .setData(Uri.parse("package:" + getPackageName())); label = "Permessi app"; break;
                default:          i.setAction(Settings.ACTION_SETTINGS); label = "Impostazioni";
            }
            launch(i, "Apro " + label + "…");
        }

        /** Avvia un'Activity di sistema dal thread UI, con toast e fallback su Impostazioni. */
        private void launch(Intent intent, String toastMsg) {
            runOnUiThread(() -> {
                if (toastMsg != null) Toast.makeText(MainActivity.this, toastMsg, Toast.LENGTH_SHORT).show();
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                    catch (Exception e2) { Toast.makeText(MainActivity.this, "Impossibile aprire le impostazioni", Toast.LENGTH_SHORT).show(); }
                }
            });
        }

        /** Versione REALE dell'app installata (da PackageInfo), come JSON. */
        @JavascriptInterface
        public String appVersion() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? p.getLongVersionCode() : p.versionCode;
                return "{\"name\":\"" + p.versionName + "\",\"code\":" + code + "}";
            } catch (Exception e) { return "{\"name\":\"?\",\"code\":0}"; }
        }

        /**
         * Aggiornamento OTA: scarica l'APK indicato e avvia l'installer di sistema.
         * Usa DownloadManager, che espone da sé una URI content:// installabile (niente
         * FileProvider). Se l'app non è ancora abilitata a installare da questa sorgente,
         * porta l'utente al setting corrispondente. L'utente conferma sempre l'installazione.
         */
        @JavascriptInterface
        public void installUpdate(String url) {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            && !getPackageManager().canRequestPackageInstalls()) {
                        Toast.makeText(MainActivity.this, "Consenti l'installazione da NovaOS, poi riprova", Toast.LENGTH_LONG).show();
                        try {
                            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + getPackageName())));
                        } catch (Exception ignore) {}
                        return;
                    }
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setTitle("NovaOS — aggiornamento");
                    req.setMimeType("application/vnd.android.package-archive");
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, "NovaOS-update.apk");
                    final long id = dm.enqueue(req);
                    Toast.makeText(MainActivity.this, "Scaricamento aggiornamento…", Toast.LENGTH_SHORT).show();
                    BroadcastReceiver rcv = new BroadcastReceiver() {
                        @Override public void onReceive(Context c, Intent i) {
                            if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                            try { c.unregisterReceiver(this); } catch (Exception ignore) {}
                            Uri apk = dm.getUriForDownloadedFile(id);
                            if (apk == null) { Toast.makeText(c, "Download non riuscito", Toast.LENGTH_LONG).show(); return; }
                            Intent it = new Intent(Intent.ACTION_VIEW)
                                    .setDataAndType(apk, "application/vnd.android.package-archive")
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            try { startActivity(it); }
                            catch (Exception e) { Toast.makeText(c, "Installer non disponibile", Toast.LENGTH_LONG).show(); }
                        }
                    };
                    IntentFilter flt = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
                    if (Build.VERSION.SDK_INT >= 33) registerReceiver(rcv, flt, Context.RECEIVER_EXPORTED);
                    else registerReceiver(rcv, flt);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Errore aggiornamento: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        // ---- Persistenza impostazioni: SharedPreferences (affidabile tra i riavvii, a
        //      differenza della localStorage della WebView su origine file://) ----
        @JavascriptInterface public String prefGet(String k) {
            return getSharedPreferences("novaos", MODE_PRIVATE).getString(k, null);
        }
        @JavascriptInterface public void prefSet(String k, String v) {
            getSharedPreferences("novaos", MODE_PRIVATE).edit().putString(k, v).apply();
        }
        @JavascriptInterface public void prefDel(String k) {
            getSharedPreferences("novaos", MODE_PRIVATE).edit().remove(k).apply();
        }

        // ---- Torcia (flash fotocamera posteriore) ----
        @JavascriptInterface public boolean setTorch(boolean on) {
            try {
                android.hardware.camera2.CameraManager cm =
                        (android.hardware.camera2.CameraManager) getSystemService(CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    Boolean flash = cm.getCameraCharacteristics(id)
                            .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer facing = cm.getCameraCharacteristics(id)
                            .get(android.hardware.camera2.CameraCharacteristics.LENS_FACING);
                    if (Boolean.TRUE.equals(flash) && (facing == null
                            || facing == android.hardware.camera2.CameraMetadata.LENS_FACING_BACK)) {
                        cm.setTorchMode(id, on);
                        return true;
                    }
                }
            } catch (Exception e) {}
            return false;
        }

        // ---- Acquisizione schermata: cattura la superficie hardware e salva in Galleria ----
        @JavascriptInterface public void screenshot() {
            runOnUiThread(() -> {
                try {
                    int w = Math.max(1, web.getWidth()), h = Math.max(1, web.getHeight());
                    // PixelCopy legge la superficie renderizzata dalla GPU: con le WebView
                    // ad accelerazione hardware web.draw() produce spesso un bitmap nero/vuoto.
                    if (Build.VERSION.SDK_INT >= 26 && getWindow() != null) {
                        final android.graphics.Bitmap bmp = android.graphics.Bitmap.createBitmap(
                                w, h, android.graphics.Bitmap.Config.ARGB_8888);
                        int[] loc = new int[2];
                        web.getLocationInWindow(loc);
                        android.graphics.Rect src = new android.graphics.Rect(
                                loc[0], loc[1], loc[0] + w, loc[1] + h);
                        android.view.PixelCopy.request(getWindow(), src, bmp, (res) -> {
                            android.util.Log.i("NovaShot", "PixelCopy result=" + res);
                            onCaptured(res == android.view.PixelCopy.SUCCESS ? bmp : drawFallback(w, h));
                        }, new android.os.Handler(android.os.Looper.getMainLooper()));
                    } else {
                        onCaptured(drawFallback(w, h));
                    }
                } catch (Exception e) {
                    android.util.Log.e("NovaShot", "capture", e);
                    Toast.makeText(MainActivity.this, "Screenshot non riuscito: " + e.getClass().getSimpleName(), Toast.LENGTH_LONG).show();
                }
            });
        }
        /** Dopo la cattura: prima invia lo screenshot alla Galleria di NovaOS (IndexedDB,
         *  sempre affidabile), poi tenta il salvataggio in DCIM/Screenshots (best-effort). */
        private void onCaptured(android.graphics.Bitmap bmp) {
            sendShotToShell(bmp);
            saveShot(bmp);
        }
        /** Invia il PNG (ridimensionato) alla shell: window.__novaShot lo aggiunge alla Galleria. */
        private void sendShotToShell(android.graphics.Bitmap bmp) {
            try {
                int max = 1280, w = bmp.getWidth(), h = bmp.getHeight();
                float sc = Math.min(1f, (float) max / Math.max(w, h));
                android.graphics.Bitmap out = sc < 1f
                        ? android.graphics.Bitmap.createScaledBitmap(bmp, Math.round(w*sc), Math.round(h*sc), true)
                        : bmp;
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                out.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, bos);
                String b64 = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP);
                final String js = "window.__novaShot && window.__novaShot('data:image/jpeg;base64," + b64 + "')";
                web.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception e) {} });
            } catch (Exception e) { android.util.Log.e("NovaShot", "toShell", e); }
        }
        /** Ripiego software: disegna la WebView su un canvas (usato pre-API26 o se PixelCopy fallisce). */
        private android.graphics.Bitmap drawFallback(int w, int h) {
            android.graphics.Bitmap bmp = android.graphics.Bitmap.createBitmap(
                    w, h, android.graphics.Bitmap.Config.ARGB_8888);
            web.draw(new android.graphics.Canvas(bmp));
            return bmp;
        }
        /** Salva il bitmap in DCIM/Screenshots (dove la Galleria mostra sempre le catture). */
        private void saveShot(android.graphics.Bitmap bmp) {
            try {
                String fn = "Screenshot_NovaOS_" + System.currentTimeMillis() + ".png";
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, fn);
                    cv.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png");
                    // DCIM/Screenshots è la cartella standard delle schermate: la Galleria
                    // (anche Samsung) la mostra sempre, a differenza di Pictures/NovaOS.
                    cv.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH,
                            android.os.Environment.DIRECTORY_DCIM + "/Screenshots");
                    cv.put(android.provider.MediaStore.Images.Media.IS_PENDING, 1);
                    android.net.Uri uri = getContentResolver().insert(
                            android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new java.io.IOException("MediaStore insert nullo");
                    java.io.OutputStream out = getContentResolver().openOutputStream(uri);
                    if (out == null) throw new java.io.IOException("OutputStream nullo");
                    bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out);
                    out.flush(); out.close();
                    cv.clear();
                    cv.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0);
                    getContentResolver().update(uri, cv, null, null);
                    where = "DCIM/Screenshots";
                    android.util.Log.i("NovaShot", "salvata " + uri);
                } else {
                    java.io.File dir = new java.io.File(
                            android.os.Environment.getExternalStoragePublicDirectory(
                                    android.os.Environment.DIRECTORY_DCIM), "Screenshots");
                    dir.mkdirs();
                    java.io.File f = new java.io.File(dir, fn);
                    java.io.OutputStream out = new java.io.FileOutputStream(f);
                    bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out);
                    out.flush(); out.close();
                    android.media.MediaScannerConnection.scanFile(MainActivity.this,
                            new String[]{ f.getAbsolutePath() }, new String[]{ "image/png" }, null);
                    where = "DCIM/Screenshots";
                    android.util.Log.i("NovaShot", "salvata " + f.getAbsolutePath());
                }
                Toast.makeText(MainActivity.this, "Schermata salvata in " + where, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                android.util.Log.e("NovaShot", "save", e);
                Toast.makeText(MainActivity.this, "Salvataggio non riuscito: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }

        // ---- Aggiornamento OTA della sola interfaccia (shell) senza reinstallare l'APK ----
        /** Svuota e prepara la cartella di staging per una nuova shell. */
        @JavascriptInterface public void shellStageBegin() { deleteRec(stageDir()); stageDir().mkdirs(); }
        /** Scrive un file della nuova shell (contenuto in base64) nella staging. */
        @JavascriptInterface public boolean shellWrite(String rel, String base64) { return writeStageFile(rel, base64); }
        /** Rende attiva la shell in staging (commit atomico) e ricarica l'interfaccia. */
        @JavascriptInterface public boolean shellCommit() {
            boolean ok = commitStage();
            if (ok) runOnUiThread(() -> { immersive(); web.loadUrl(resolveShellUrl()); });
            return ok;
        }
        /** Ripristino: elimina la shell interna e torna a quella dell'APK. */
        @JavascriptInterface public void shellReset() {
            deleteRec(shellDir()); deleteRec(stageDir());
            runOnUiThread(() -> { immersive(); web.loadUrl(PROD_URL); });
        }
        /** Diagnostica: da dove è caricata la shell ("internal" | "asset" | "dev"). */
        @JavascriptInterface public String shellSource() {
            String u = resolveShellUrl();
            return DEV ? "dev" : (u.equals(PROD_URL) ? "asset" : "internal");
        }

        // ---- Mail reale (SMTP/IMAP). I risultati tornano via window.NovaMail.* ----
        @JavascriptInterface public void mailConfigure(String json) { mail.configure(json); }
        @JavascriptInterface public String mailAccount()            { return mail.account(); }
        @JavascriptInterface public void mailClear()                { mail.clear(); }
        @JavascriptInterface public void mailSend(String json)      { mail.send(json); }
        @JavascriptInterface public void mailFetch(String folder, int limit) { mail.fetch(folder, limit); }
    }

    /** Il tasto Indietro lo gestisce la shell (window manager interno). */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
            "window.NovaBack && window.NovaBack();", null);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
