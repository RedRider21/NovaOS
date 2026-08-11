package os.nova.launcher;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup.LayoutParams;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Browser nativo di NovaOS: una WebView a SCHERMO INTERO (navigazione top-level).
 * A differenza dell'iframe della shell, qui i siti con X-Frame-Options si aprono
 * regolarmente (banche, social, ecc.). Aperto dalla web app Browser via
 * window.NovaNative.openBrowser(url).
 */
public class BrowserActivity extends Activity {

    private WebView web;
    private TextView urlBar;

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

        Button reload = new Button(this);
        reload.setText("⟳");
        reload.setBackgroundColor(Color.TRANSPARENT);
        reload.setTextColor(Color.WHITE);
        reload.setOnClickListener(v -> web.reload());

        bar.addView(close);
        bar.addView(urlBar);
        bar.addView(reload);

        web = new WebView(this);
        web.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) {
                urlBar.setText(url);
            }
        });

        root.addView(bar);
        root.addView(web);
        setContentView(root);

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://www.google.com";
        if (!url.matches("^[a-zA-Z]+://.*")) url = "https://" + url;
        web.loadUrl(url);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
