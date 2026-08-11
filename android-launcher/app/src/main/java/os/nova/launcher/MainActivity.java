package os.nova.launcher;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
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

    /** Esegue JS nella WebView dal thread UI (usato dai callback di rete della Mail). */
    void evalJs(String js) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); }); }

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
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        // ponte email reale (SMTP/IMAP via JavaMail)
        mail = new MailBridge(getApplicationContext(), this::evalJs);

        // ponte JS <-> Android: espone l'hardware reale alle web app come window.NovaNative
        web.addJavascriptInterface(new NovaBridge(), "NovaNative");

        // richiede a runtime i permessi che servono per le funzioni reali:
        // CALL_PHONE abilita la chiamata DIRETTA (ACTION_CALL) invece del dialer.
        java.util.List<String> need = new java.util.ArrayList<>();
        for (String p : new String[]{ android.Manifest.permission.CALL_PHONE, android.Manifest.permission.CAMERA }) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);

        // collega la schermata di chiamata e chiede di diventare telefono predefinito
        CallHub.setActivity(this);
        requestDefaultDialer();

        immersive();
        web.loadUrl(DEV ? DEV_URL : PROD_URL);
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
                Intent chooser = Intent.createChooser(send, "Condividi foto");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
