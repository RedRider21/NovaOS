package os.nova.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewGroup.LayoutParams;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Browser di NovaOS in stile Chrome mobile: omnibox editabile (ricerca o URL),
 * barra di avanzamento, schede multiple con selettore, modalità incognito,
 * menu con preferiti / cronologia / trova nella pagina / sito desktop / condividi /
 * download / apri in Chrome. WebView a schermo intero: i siti con X-Frame-Options
 * (banche, social) si aprono regolarmente. Aperto via window.NovaNative.openBrowser(url).
 */
public class BrowserActivity extends Activity {

    // ---- una scheda del browser ----
    private static class Tab {
        WebView web;
        String title = "Nuova scheda";
        boolean incognito = false;
        boolean desktop = false;
    }

    private final List<Tab> tabs = new ArrayList<>();
    private int current = -1;

    private FrameLayout holder;      // contiene la WebView della scheda attiva
    private EditText omnibox;        // barra indirizzo/ricerca editabile
    private TextView secIco;         // lucchetto/globo sicurezza
    private Button tabBtn;           // contatore schede -> selettore
    private ProgressBar progress;    // avanzamento caricamento
    private LinearLayout findBar;    // barra "trova nella pagina"
    private EditText findInput;

    private String mobileUa;
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    private static final String SEARCH = "https://www.google.com/search?q=";

    private static final int BG = 0xFF0b0f17, BAR = 0xFF151a24, TXT = 0xFFe8ecf4, DIM = 0xFF9aa4b8, ACC = 0xFF0a84ff;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);

        LinearLayout rootv = new LinearLayout(this);
        rootv.setOrientation(LinearLayout.VERTICAL);
        rootv.setBackgroundColor(BG);

        // ---- barra superiore: [scheda] [ omnibox ] [⋮] ----
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BAR);
        bar.setPadding(dp(8), dp(10), dp(8), dp(10));

        tabBtn = iconBtn("1");
        tabBtn.setBackground(squareBadge());
        tabBtn.setOnClickListener(v -> showTabSwitcher());

        // capsula omnibox
        LinearLayout cap = new LinearLayout(this);
        cap.setOrientation(LinearLayout.HORIZONTAL);
        cap.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable capBg = new GradientDrawable();
        capBg.setColor(0xFF232937); capBg.setCornerRadius(dp(22));
        cap.setBackground(capBg);
        cap.setPadding(dp(14), 0, dp(6), 0);
        LinearLayout.LayoutParams capLp = new LinearLayout.LayoutParams(0, dp(42), 1f);
        capLp.leftMargin = dp(6); capLp.rightMargin = dp(4);
        cap.setLayoutParams(capLp);

        secIco = new TextView(this);
        secIco.setText("🔒");
        secIco.setTextColor(DIM);
        secIco.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);

        omnibox = new EditText(this);
        omnibox.setSingleLine(true);
        omnibox.setBackgroundColor(Color.TRANSPARENT);
        omnibox.setTextColor(TXT);
        omnibox.setHint("Cerca o digita un indirizzo");
        omnibox.setHintTextColor(DIM);
        omnibox.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        omnibox.setInputType(InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        omnibox.setImeOptions(EditorInfo.IME_ACTION_GO);
        omnibox.setPadding(dp(10), 0, dp(6), 0);
        omnibox.setLayoutParams(new LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f));
        omnibox.setOnEditorActionListener((tv, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_NULL) { navigate(omnibox.getText().toString()); return true; }
            return false;
        });
        omnibox.setOnFocusChangeListener((v, has) -> { if (has) omnibox.selectAll(); });

        Button reload = iconBtn("⟳");
        reload.setOnClickListener(v -> { WebView w = curWeb(); if (w != null) w.reload(); });

        cap.addView(secIco);
        cap.addView(omnibox);
        cap.addView(reload);

        Button menu = iconBtn("⋮");
        menu.setOnClickListener(this::showMenu);

        bar.addView(tabBtn);
        bar.addView(cap);
        bar.addView(menu);

        // barra di avanzamento
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(3)));
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(ACC));
        progress.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(BAR));
        progress.setVisibility(View.GONE);

        holder = new FrameLayout(this);
        holder.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));

        // barra "trova nella pagina" (nascosta)
        findBar = buildFindBar();

        rootv.addView(bar);
        rootv.addView(progress);
        rootv.addView(findBar);
        rootv.addView(holder);
        setContentView(rootv);

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://www.google.com";
        if (!url.matches("^[a-zA-Z]+://.*")) url = "https://" + url;
        boolean desk = getIntent().getBooleanExtra("desktop", false) || wantsDesktop(url);
        newTab(url, false, desk);
    }

    // ------------------------------------------------------------------ schede
    private WebView curWeb() { return current >= 0 && current < tabs.size() ? tabs.get(current).web : null; }

    private void newTab(String url, boolean incognito, boolean desktop) {
        Tab t = new Tab();
        t.incognito = incognito;
        t.desktop = desktop;
        t.web = buildWebView(t);
        tabs.add(t);
        selectTab(tabs.size() - 1);
        applyUa(t);
        if (url != null) t.web.loadUrl(url);
        rootv().setBackgroundColor(incognito ? 0xFF1a1030 : BG);
    }

    private LinearLayout rootv() { return (LinearLayout) ((ViewGroup) findViewById(android.R.id.content)).getChildAt(0); }

    private void selectTab(int i) {
        if (i < 0 || i >= tabs.size()) return;
        current = i;
        holder.removeAllViews();
        WebView w = tabs.get(i).web;
        if (w.getParent() != null) ((ViewGroup) w.getParent()).removeView(w);
        holder.addView(w, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        tabBtn.setText(String.valueOf(tabs.size()));
        rootv().setBackgroundColor(tabs.get(i).incognito ? 0xFF1a1030 : BG);
        syncBar(w.getUrl());
    }

    private void closeTab(int i) {
        if (i < 0 || i >= tabs.size()) return;
        Tab t = tabs.remove(i);
        try { t.web.destroy(); } catch (Exception e) {}
        if (tabs.isEmpty()) { finish(); return; }
        selectTab(Math.max(0, i - 1));
    }

    private void showTabSwitcher() {
        // Ogni voce è una riga a tutta larghezza (chiara e toccabile): le schede
        // aperte, poi le azioni "Nuova scheda" e "Chiudi scheda corrente".
        int n = tabs.size();
        String[] items = new String[n + 2];
        for (int i = 0; i < n; i++) {
            Tab t = tabs.get(i);
            String ti = t.web.getTitle();
            String label = (ti != null && !ti.isEmpty() ? ti : "Nuova scheda");
            items[i] = (i == current ? "●  " : "○  ") + (t.incognito ? "🕵 " : "") + label;
        }
        items[n]     = "＋  Nuova scheda";
        items[n + 1] = "✕  Chiudi scheda corrente";
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
            .setTitle("Schede (" + n + ")")
            .setItems(items, (d, w) -> {
                if (w < tabs.size()) selectTab(w);
                else if (w == tabs.size()) newTab("https://www.google.com", false, false);
                else closeTab(current);
            })
            .setNegativeButton("Annulla", null)
            .show();
    }

    // ------------------------------------------------------------------ menu
    private void showMenu(View anchor) {
        PopupMenu p = new PopupMenu(this, anchor);
        p.getMenu().add(0, 1, 0, "Nuova scheda");
        p.getMenu().add(0, 2, 0, "Nuova scheda in incognito");
        p.getMenu().add(0, 3, 0, curWeb() != null && curWeb().canGoForward() ? "Avanti →" : "Avanti");
        p.getMenu().add(0, 4, 0, "Preferiti");
        p.getMenu().add(0, 5, 0, "Aggiungi ai preferiti ☆");
        p.getMenu().add(0, 6, 0, "Cronologia");
        p.getMenu().add(0, 7, 0, "Trova nella pagina");
        p.getMenu().add(0, 8, 0, curTab() != null && curTab().desktop ? "Sito mobile" : "Sito desktop");
        p.getMenu().add(0, 9, 0, "Condividi…");
        p.getMenu().add(0, 10, 0, "Apri in Chrome");
        p.setOnMenuItemClickListener(mi -> {
            WebView w = curWeb();
            switch (mi.getItemId()) {
                case 1: newTab("https://www.google.com", false, false); return true;
                case 2: newTab("https://www.google.com", true, false); return true;
                case 3: if (w != null && w.canGoForward()) w.goForward(); return true;
                case 4: showBookmarks(); return true;
                case 5: if (w != null) addBookmark(w.getTitle(), w.getUrl()); return true;
                case 6: showHistory(); return true;
                case 7: showFindBar(true); return true;
                case 8: if (curTab() != null) { curTab().desktop = !curTab().desktop; applyUa(curTab()); if (w != null) w.reload(); } return true;
                case 9: shareUrl(w != null ? w.getUrl() : null); return true;
                case 10: openInSystemBrowser(w != null ? w.getUrl() : null); return true;
            }
            return false;
        });
        p.show();
    }

    private Tab curTab() { return current >= 0 && current < tabs.size() ? tabs.get(current) : null; }

    // ------------------------------------------------------------------ navigazione
    private void navigate(String input) {
        input = input == null ? "" : input.trim();
        if (input.isEmpty()) return;
        String url;
        if (input.matches("^[a-zA-Z][a-zA-Z0-9+.\\-]*://.*")) url = input;
        else if (input.contains(".") && !input.contains(" ")) url = "https://" + input;
        else url = SEARCH + Uri.encode(input);
        WebView w = curWeb();
        if (w != null) w.loadUrl(url);
        hideKeyboard();
        omnibox.clearFocus();
    }

    private void syncBar(String url) {
        if (url == null) url = "";
        if (!omnibox.hasFocus()) omnibox.setText(url);
        secIco.setText(url.startsWith("https://") ? "🔒" : "⚠");
        secIco.setTextColor(url.startsWith("https://") ? DIM : 0xFFff9f0a);
    }

    // ------------------------------------------------------------------ WebView
    private WebView buildWebView(Tab tab) {
        WebView v = new WebView(this);
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(!tab.incognito);
        s.setDatabaseEnabled(!tab.incognito);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        if (tab.incognito) s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (mobileUa == null) mobileUa = s.getUserAgentString() + " NovaOS";
        s.setUserAgentString(mobileUa);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(v, !tab.incognito);

        v.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView vw, String url, android.graphics.Bitmap f) {
                if (vw == curWeb()) syncBar(url);
            }
            @Override public void onPageFinished(WebView vw, String url) {
                if (vw == curWeb()) syncBar(url);
                if (!tab.incognito) addHistory(vw.getTitle(), url);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView vw, WebResourceRequest req) {
                String u = req.getUrl() != null ? req.getUrl().toString() : "";
                // schemi non http (tel:, mailto:, intent:) -> delega al sistema
                if (!u.startsWith("http://") && !u.startsWith("https://")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); return true; } catch (Exception e) { return true; }
                }
                return false;
            }
            @Override public void onReceivedError(WebView vw, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) {
                    String u = req.getUrl() != null ? req.getUrl().toString() : vw.getUrl();
                    Toast.makeText(BrowserActivity.this, "Il sito blocca la vista incorporata: apro in Chrome", Toast.LENGTH_SHORT).show();
                    openInSystemBrowser(u);
                }
            }
        });
        v.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView vw, int p) {
                if (vw != curWeb()) return;
                if (p < 100) { progress.setVisibility(View.VISIBLE); progress.setProgress(p); }
                else progress.setVisibility(View.GONE);
            }
            @Override public void onReceivedTitle(WebView vw, String title) {
                tab.title = title;
            }
            @Override public boolean onCreateWindow(WebView vw, boolean dialog, boolean gesture, Message resultMsg) {
                // popup di login: aprili in una nuova scheda
                newTab(null, tab.incognito, tab.desktop);
                WebView href = curWeb();
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(href);
                resultMsg.sendToTarget();
                return true;
            }
        });
        // download reali (PDF, immagini, file): usa il DownloadManager di sistema
        v.setDownloadListener((url, ua, disp, mime, len) -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setMimeType(mime);
                r.addRequestHeader("User-Agent", ua);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String name = URLUtil.guessFileName(url, disp, mime);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(r);
                Toast.makeText(this, "Download avviato: " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Download non riuscito", Toast.LENGTH_SHORT).show();
            }
        });
        return v;
    }

    private void applyUa(Tab t) {
        if (t == null || t.web == null) return;
        WebSettings s = t.web.getSettings();
        if (t.desktop) { s.setUserAgentString(DESKTOP_UA); s.setUseWideViewPort(true); s.setLoadWithOverviewMode(true); }
        else s.setUserAgentString(mobileUa);
    }

    private boolean wantsDesktop(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            return host.contains("web.whatsapp.com") || host.contains("web.telegram.org");
        } catch (Exception e) { return false; }
    }

    // ------------------------------------------------------------------ trova nella pagina
    private LinearLayout buildFindBar() {
        LinearLayout f = new LinearLayout(this);
        f.setOrientation(LinearLayout.HORIZONTAL);
        f.setGravity(Gravity.CENTER_VERTICAL);
        f.setBackgroundColor(BAR);
        f.setPadding(dp(12), dp(6), dp(8), dp(6));
        f.setVisibility(View.GONE);
        findInput = new EditText(this);
        findInput.setSingleLine(true);
        findInput.setHint("Trova nella pagina");
        findInput.setHintTextColor(DIM);
        findInput.setTextColor(TXT);
        findInput.setBackgroundColor(Color.TRANSPARENT);
        findInput.setLayoutParams(new LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f));
        findInput.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) { WebView w = curWeb(); if (w != null) w.findAllAsync(s.toString()); }
            public void afterTextChanged(Editable s) {}
        });
        Button prev = iconBtn("↑"); prev.setOnClickListener(v -> { WebView w = curWeb(); if (w != null) w.findNext(false); });
        Button next = iconBtn("↓"); next.setOnClickListener(v -> { WebView w = curWeb(); if (w != null) w.findNext(true); });
        Button x = iconBtn("✕"); x.setOnClickListener(v -> showFindBar(false));
        f.addView(findInput); f.addView(prev); f.addView(next); f.addView(x);
        return f;
    }
    private void showFindBar(boolean show) {
        findBar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) { findInput.requestFocus(); }
        else { WebView w = curWeb(); if (w != null) w.clearMatches(); findInput.setText(""); hideKeyboard(); }
    }

    // ------------------------------------------------------------------ preferiti / cronologia (SharedPreferences)
    private SharedPreferences prefs() { return getSharedPreferences("nova_browser", MODE_PRIVATE); }
    private JSONArray arr(String k) { try { return new JSONArray(prefs().getString(k, "[]")); } catch (Exception e) { return new JSONArray(); } }
    private void putArr(String k, JSONArray a) { prefs().edit().putString(k, a.toString()).apply(); }

    private void addBookmark(String title, String url) {
        if (url == null || url.isEmpty()) return;
        try {
            JSONArray a = arr("bookmarks");
            for (int i = 0; i < a.length(); i++) if (url.equals(a.getJSONObject(i).optString("url"))) { Toast.makeText(this, "Già nei preferiti", Toast.LENGTH_SHORT).show(); return; }
            JSONObject o = new JSONObject(); o.put("title", title == null ? url : title); o.put("url", url);
            a.put(o); putArr("bookmarks", a);
            Toast.makeText(this, "Aggiunto ai preferiti", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {}
    }
    private void addHistory(String title, String url) {
        if (url == null || url.isEmpty() || url.startsWith("data:")) return;
        try {
            JSONArray a = arr("history");
            JSONArray out = new JSONArray();
            JSONObject o = new JSONObject(); o.put("title", title == null ? url : title); o.put("url", url); o.put("t", System.currentTimeMillis());
            out.put(o);
            for (int i = 0; i < a.length() && out.length() < 60; i++) {
                JSONObject e = a.getJSONObject(i);
                if (!url.equals(e.optString("url"))) out.put(e);
            }
            putArr("history", out);
        } catch (Exception e) {}
    }
    private void showBookmarks() { showList("Preferiti", arr("bookmarks"), true); }
    private void showHistory() { showList("Cronologia", arr("history"), false); }
    private void showList(String title, JSONArray a, boolean isBm) {
        int n = a.length();
        final String[] labels = new String[n];
        final String[] urls = new String[n];
        for (int i = 0; i < n; i++) {
            JSONObject o = a.optJSONObject(i);
            labels[i] = o != null ? o.optString("title", o.optString("url")) : "";
            urls[i] = o != null ? o.optString("url") : "";
        }
        AlertDialog.Builder bld = new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle(title);
        if (n == 0) bld.setMessage(isBm ? "Nessun preferito." : "Nessuna cronologia.");
        else bld.setItems(labels, (d, w) -> { WebView wv = curWeb(); if (wv != null) wv.loadUrl(urls[w]); });
        if (!isBm && n > 0) bld.setNeutralButton("Cancella", (d, w) -> putArr("history", new JSONArray()));
        bld.setNegativeButton("Chiudi", null).show();
    }

    // ------------------------------------------------------------------ condividi / sistema
    private void shareUrl(String url) {
        if (url == null || url.isEmpty()) return;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, url);
        startActivity(Intent.createChooser(i, "Condividi"));
    }
    private void openInSystemBrowser(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Nessun browser disponibile sul dispositivo", Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------------ util UI
    private Button iconBtn(String glyph) {
        Button b = new Button(this);
        b.setText(glyph);
        b.setAllCaps(false);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setTextColor(TXT);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        b.setMinWidth(dp(40)); b.setMinimumWidth(dp(40));
        b.setPadding(dp(6), 0, dp(6), 0);
        return b;
    }
    private GradientDrawable squareBadge() {
        GradientDrawable g = new GradientDrawable();
        g.setStroke(dp(2), DIM); g.setCornerRadius(dp(5)); g.setColor(Color.TRANSPARENT);
        return g;
    }
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }
    private void hideKeyboard() {
        try { InputMethodManager im = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            im.hideSoftInputFromWindow(omnibox.getWindowToken(), 0); } catch (Exception e) {}
    }

    @Override public void onBackPressed() {
        if (findBar.getVisibility() == View.VISIBLE) { showFindBar(false); return; }
        WebView w = curWeb();
        if (w != null && w.canGoBack()) w.goBack();
        else if (tabs.size() > 1) closeTab(current);
        else super.onBackPressed();
    }
}
