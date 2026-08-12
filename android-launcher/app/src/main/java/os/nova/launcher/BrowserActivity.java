package os.nova.launcher;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup.LayoutParams;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Browser nativo di NovaOS: una WebView a SCHERMO INTERO (navigazione top-level).
 * A differenza dell'iframe della shell, qui i siti con X-Frame-Options si aprono
 * regolarmente (banche, social, ecc.). Aperto dalla web app Browser via
 * window.NovaNative.openBrowser(url).
 */
public class BrowserActivity extends Activity {

    private WebView web;
    private TextView urlBar;
    private Button dtBtn;                 // interruttore vista desktop/mobile
    private String mobileUa;             // UA mobile originale (+ " NovaOS")
    private boolean desktopMode = false;
    // UA di un Chrome desktop: serve a WhatsApp/Telegram Web per mostrare il QR
    // (con UA mobile reindirizzano all'app e non fanno accedere via web).
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0b0f17"));

        // barra superiore: Chiudi | url | Ricarica
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(24, 24, 24, 16);

        Button close = new Button(this);
        close.setText("✕");
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setTextColor(Color.WHITE);
        close.setOnClickListener(v -> finish());

        urlBar = new TextView(this);
        urlBar.setTextColor(Color.parseColor("#9aa4b8"));
        urlBar.setSingleLine(true);
        LinearLayout.LayoutParams ulp = new LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f);
        ulp.leftMargin = 12; ulp.rightMargin = 12;
        urlBar.setLayoutParams(ulp);

        dtBtn = new Button(this);
        dtBtn.setText("🖥");                        // richiedi/annulla vista desktop
        dtBtn.setBackgroundColor(Color.TRANSPARENT);
        dtBtn.setTextColor(Color.WHITE);
        dtBtn.setOnClickListener(v -> { desktopMode = !desktopMode; applyUa(true); });

        Button chrome = new Button(this);
        chrome.setText("⧉");                       // apre nel browser di sistema (Chrome)
        chrome.setBackgroundColor(Color.TRANSPARENT);
        chrome.setTextColor(Color.WHITE);
        chrome.setOnClickListener(v -> openInSystemBrowser(web.getUrl()));

        Button reload = new Button(this);
        reload.setText("⟳");
        reload.setBackgroundColor(Color.TRANSPARENT);
        reload.setTextColor(Color.WHITE);
        reload.setOnClickListener(v -> web.reload());

        bar.addView(close);
        bar.addView(urlBar);
        bar.addView(dtBtn);
        bar.addView(chrome);
        bar.addView(reload);

        web = buildWebView();
        web.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));

        root.addView(bar);
        root.addView(web);
        setContentView(root);

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://www.google.com";
        if (!url.matches("^[a-zA-Z]+://.*")) url = "https://" + url;
        // WhatsApp/Telegram Web (o richiesta esplicita): parti già in vista desktop
        desktopMode = getIntent().getBooleanExtra("desktop", false) || wantsDesktop(url);
        applyUa(false);
        web.loadUrl(url);
    }

    /** true per i siti che mostrano il QR/login solo a un browser desktop. */
    private boolean wantsDesktop(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            return host.contains("web.whatsapp.com") || host.contains("web.telegram.org");
        } catch (Exception e) { return false; }
    }

    /** Applica lo User-Agent (desktop o mobile) e aggiorna l'icona del pulsante. */
    private void applyUa(boolean reload) {
        WebSettings s = web.getSettings();
        if (desktopMode) {
            s.setUserAgentString(DESKTOP_UA);
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
        } else {
            s.setUserAgentString(mobileUa);
        }
        if (dtBtn != null) dtBtn.setText(desktopMode ? "📱" : "🖥");
        if (reload && web != null) web.reload();
    }

    /** Crea e configura una WebView "vera" (banche, Google, login in popup, ecc.). */
    private WebView buildWebView() {
        WebView v = new WebView(this);
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // molti siti (banche) caricano risorse http su pagine https: senza questo restano bianchi
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // i login di banche/Google spesso si aprono in un popup (window.open / target=_blank)
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // user agent "mobile" completo: alcuni siti bloccano/impaginano male i WebView generici.
        // Lo memorizziamo per poter tornare da desktop a mobile con applyUa().
        mobileUa = s.getUserAgentString() + " NovaOS";
        s.setUserAgentString(mobileUa);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(v, true);   // necessario per molti login bancari/SSO

        v.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView vw, String url, android.graphics.Bitmap f) {
                if (urlBar != null) urlBar.setText(url);
            }
            // se il sito blocca la pagina principale (X-Frame-Options/COOP/ERR_BLOCKED_BY_RESPONSE,
            // ecc.), la WebView non può mostrarla: la apriamo nel browser di sistema (Chrome).
            @Override public void onReceivedError(WebView vw, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) {
                    String u = req.getUrl() != null ? req.getUrl().toString() : vw.getUrl();
                    Toast.makeText(BrowserActivity.this, "Il sito blocca la vista incorporata: apro in Chrome", Toast.LENGTH_SHORT).show();
                    openInSystemBrowser(u);
                    finish();
                }
            }
        });
        v.setWebChromeClient(new WebChromeClient() {
            // apre i popup (finestre di login) dentro la stessa WebView invece di scartarli
            @Override public boolean onCreateWindow(WebView vw, boolean dialog, boolean gesture, Message resultMsg) {
                WebView href = new WebView(BrowserActivity.this);
                href.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView t, String u) { web.loadUrl(u); return true; }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(href);
                resultMsg.sendToTarget();
                return true;
            }
        });
        return v;
    }

    /** Apre l'URL nel browser di sistema (Chrome), fuori da NovaOS. */
    private void openInSystemBrowser(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            // evita di riaprire NovaOS stesso: preferisci un vero browser
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Nessun browser disponibile sul dispositivo", Toast.LENGTH_SHORT).show();
        }
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
