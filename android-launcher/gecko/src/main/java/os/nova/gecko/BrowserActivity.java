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
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.PorterDuff;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebRequestError;
import org.mozilla.geckoview.WebResponse;
import os.nova.gecko.MotoreGecko;
import os.nova.gecko.R;

public class BrowserActivity
extends Activity
implements GeckoSession.NavigationDelegate,
GeckoSession.ProgressDelegate,
GeckoSession.ContentDelegate,
GeckoSession.PromptDelegate,
GeckoSession.PermissionDelegate {
    private static final String TAG = "NovaGeckoSpike";
    private FrameLayout selettore;
    private final List<Scheda> schede = new ArrayList<Scheda>();
    private int corrente = -1;
    private GeckoView vista;
    private FrameLayout holder;
    private EditText omnibox;
    private ImageView secIco;
    private Button tabBtn;
    private LinearLayout bar;
    private LinearLayout cap;
    private ImageView incBadge;
    private PopupWindow menuAperto;
    private ProgressBar progress;
    private LinearLayout findBar;
    private EditText findInput;
    private TextView findInfo;
    private static final int ACC = -16087809;
    private static final String SEARCH = "https://www.google.com/search?q=";
    private static final String HOME_PREDEFINITA = "https://www.google.com/";
    private static final String UA_DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    private int BG;
    private int BAR;
    private int TXT;
    private int DIM;
    private int CAP;
    private int CARD;
    private int PH;
    private int SCRIM;
    private static final int INC_BG = -15264737;
    private static final int INC_BAR = -14015432;
    private static final int INC_CAP = -12962992;
    private static final int RICHIESTA_FILE = 4801;
    private GeckoSession.PromptDelegate.FilePrompt fileInAttesa;
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> esitoFile;
    private static final String CARTELLA_CARICAMENTI = "nova-caricamenti";
    private static final int RICHIESTA_CAMERA_MIC = 4811;
    private static final int RICHIESTA_POSIZIONE = 4812;
    private boolean permessiInCorso = false;
    private final ArrayDeque<Runnable> permessiInCoda = new ArrayDeque();
    private GeckoSession.PermissionDelegate.MediaCallback mediaInAttesa;
    private GeckoSession.PermissionDelegate.MediaSource[] videoInAttesa;
    private GeckoSession.PermissionDelegate.MediaSource[] audioInAttesa;
    private GeckoResult<Integer> posizioneInAttesa;
    private static final int RICHIESTA_ANDROID = 4813;
    private GeckoSession.PermissionDelegate.Callback callbackInAttesa;
    private static final String PREF_HOME = "nova:browserHome";
    private boolean fullscreen = false;
    private Button fsRestore;

    private void initTheme() {
        boolean light;
        String t = this.getSharedPreferences("novaos", 0).getString("nova:theme", "\"dark\"");
        boolean bl = light = t != null && t.contains("light");
        if (light) {
            this.BG = -854792;
            this.BAR = -1;
            this.TXT = -15459804;
            this.DIM = -10787726;
            this.CAP = -1446413;
            this.CARD = -1;
            this.PH = -1775377;
            this.SCRIM = -220207894;
        } else {
            this.BG = -16052457;
            this.BAR = -15394268;
            this.TXT = -1512204;
            this.DIM = -6642504;
            this.CAP = -14472905;
            this.CARD = -14933199;
            this.PH = -15789027;
            this.SCRIM = -234419696;
        }
    }

    protected void onCreate(Bundle b) {
        super.onCreate(b);
        this.initTheme();
        LinearLayout rootv = new LinearLayout((Context)this);
        rootv.setOrientation(1);
        rootv.setBackgroundColor(this.BG);
        this.bar = new LinearLayout((Context)this);
        this.bar.setOrientation(0);
        this.bar.setGravity(16);
        this.bar.setBackgroundColor(this.BAR);
        this.bar.setPadding(this.dp(8), this.dp(10), this.dp(8), this.dp(10));
        this.incBadge = this.iconaVista(R.drawable.ic_incognito, 20, this.TXT);
        this.incBadge.setPadding(this.dp(2), 0, this.dp(2), 0);
        this.incBadge.setVisibility(8);
        this.tabBtn = this.iconBtn("1");
        this.tabBtn.setBackground((Drawable)this.squareBadge());
        this.tabBtn.setOnClickListener(v -> this.mostraSelettore());
        this.cap = new LinearLayout((Context)this);
        this.cap.setOrientation(0);
        this.cap.setGravity(16);
        GradientDrawable capBg = new GradientDrawable();
        capBg.setColor(this.CAP);
        capBg.setCornerRadius((float)this.dp(22));
        this.cap.setBackground((Drawable)capBg);
        this.cap.setPadding(this.dp(14), 0, this.dp(6), 0);
        LinearLayout.LayoutParams capLp = new LinearLayout.LayoutParams(0, this.dp(42), 1.0f);
        capLp.leftMargin = this.dp(6);
        capLp.rightMargin = this.dp(4);
        this.cap.setLayoutParams((ViewGroup.LayoutParams)capLp);
        this.secIco = this.iconaVista(R.drawable.ic_lock, 15, this.DIM);
        this.omnibox = new EditText((Context)this);
        this.omnibox.setSingleLine(true);
        this.omnibox.setBackgroundColor(0);
        this.omnibox.setTextColor(this.TXT);
        this.omnibox.setHint((CharSequence)"Cerca o digita un indirizzo");
        this.omnibox.setHintTextColor(this.DIM);
        this.omnibox.setTextSize(2, 15.0f);
        this.omnibox.setInputType(524304);
        this.omnibox.setFocusableInTouchMode(true);
        this.omnibox.setImeOptions(2);
        this.omnibox.setPadding(this.dp(10), 0, this.dp(6), 0);
        this.omnibox.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(0, -1, 1.0f));
        this.omnibox.setOnEditorActionListener((tv, id2, ev) -> {
            if (id2 == 2 || id2 == 0) {
                this.naviga(this.omnibox.getText().toString());
                return true;
            }
            return false;
        });
        this.omnibox.setOnFocusChangeListener((v, has) -> {
            if (has) {
                this.omnibox.selectAll();
            }
        });
        Button reload = this.iconBtn("\u27f3");
        reload.setOnClickListener(v -> {
            Scheda s = this.schedaCorrente();
            if (s != null) {
                s.sessione.reload();
            }
        });
        this.cap.addView((View)this.secIco);
        this.cap.addView((View)this.omnibox);
        this.cap.addView((View)reload);
        ImageView casa = this.iconaBtn(R.drawable.ic_home);
        casa.setOnClickListener(v -> this.vaiAllaHome());
        Button piu = this.iconBtn("\uff0b");
        piu.setOnClickListener(v -> this.nuovaScheda(this.paginaIniziale(), false, false));
        Button menu = this.iconBtn("\u22ee");
        menu.setOnClickListener(this::mostraMenu);
        this.bar.addView((View)casa);
        this.bar.addView((View)this.cap);
        this.bar.addView((View)piu);
        this.bar.addView((View)this.incBadge);
        this.bar.addView((View)this.tabBtn);
        this.bar.addView((View)menu);
        this.progress = new ProgressBar((Context)this, null, 16842872);
        this.progress.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(-1, this.dp(3)));
        this.progress.setMax(100);
        this.progress.setProgressTintList(ColorStateList.valueOf((int)-16087809));
        this.progress.setProgressBackgroundTintList(ColorStateList.valueOf((int)this.BAR));
        this.progress.setVisibility(8);
        this.holder = new FrameLayout((Context)this);
        this.holder.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(-1, 0, 1.0f));
        this.vista = new GeckoView((Context)this);
        this.findBar = this.buildFindBar();
        rootv.addView((View)this.bar);
        rootv.addView((View)this.progress);
        rootv.addView((View)this.findBar);
        rootv.addView((View)this.holder);
        this.setContentView((View)rootv);
        rootv.setFocusableInTouchMode(true);
        rootv.requestFocus();
        String url = this.getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) {
            url = "https://www.google.com";
        }
        if (!url.matches("^[a-zA-Z]+://.*")) {
            url = "https://" + url;
        }
        boolean desk = this.getIntent().getBooleanExtra("desktop", false) || this.vuoleDesktop(url);
        this.nuovaScheda(url, false, desk);
    }

    private Scheda schedaCorrente() {
        return this.corrente >= 0 && this.corrente < this.schede.size() ? this.schede.get(this.corrente) : null;
    }

    private Scheda schedaDi(GeckoSession s) {
        for (Scheda t : this.schede) {
            if (t.sessione != s) continue;
            return t;
        }
        return null;
    }

    private GeckoSession sessioneInVista() {
        Scheda s = this.schedaCorrente();
        return s == null ? null : s.sessione;
    }

    private GeckoSession creaSessione(boolean incognito, boolean desktop) {
        GeckoSessionSettings.Builder imp = new GeckoSessionSettings.Builder().usePrivateMode(incognito).userAgentMode(desktop ? 1 : 0).viewportMode(desktop ? 1 : 0);
        if (desktop) {
            imp.userAgentOverride(UA_DESKTOP);
        }
        GeckoSession sessione = new GeckoSession(imp.build());
        sessione.setNavigationDelegate((GeckoSession.NavigationDelegate)this);
        sessione.setProgressDelegate((GeckoSession.ProgressDelegate)this);
        sessione.setContentDelegate((GeckoSession.ContentDelegate)this);
        sessione.setPromptDelegate((GeckoSession.PromptDelegate)this);
        sessione.setPermissionDelegate((GeckoSession.PermissionDelegate)this);
        return sessione;
    }

    private Scheda schedaNonAperta(boolean incognito, boolean desktop) {
        Scheda t = new Scheda();
        t.incognito = incognito;
        t.desktop = desktop;
        t.sessione = this.creaSessione(incognito, desktop);
        this.schede.add(t);
        return t;
    }

    private Scheda nuovaScheda(String url, boolean incognito, boolean desktop) {
        Scheda t = this.schedaNonAperta(incognito, desktop);
        t.sessione.open(MotoreGecko.get((Context)this));
        this.mostraScheda(this.schede.size() - 1);
        if (url != null && !url.isEmpty()) {
            t.sessione.loadUri(url);
        }
        return t;
    }

    private void mostraScheda(int i) {
        if (i < 0 || i >= this.schede.size()) {
            return;
        }
        if (this.corrente >= 0 && this.corrente < this.schede.size() && this.corrente != i) {
            this.catturaAnteprima(this.schede.get(this.corrente));
        }
        this.corrente = i;
        Scheda t = this.schede.get(i);
        GeckoSession attuale = this.vista.getSession();
        if (attuale != null && attuale != t.sessione) {
            this.vista.releaseSession();
        }
        this.vista.setSession(t.sessione);
        this.holder.removeAllViews();
        this.holder.addView((View)this.vista, (ViewGroup.LayoutParams)new FrameLayout.LayoutParams(-1, -1));
        this.tabBtn.setText((CharSequence)String.valueOf(this.schede.size()));
        LinearLayout rv = this.radice();
        if (rv != null) {
            rv.setBackgroundColor(t.incognito ? -15264737 : this.BG);
        }
        this.omnibox.clearFocus();
        this.syncBar(t.indirizzo);
    }

    private void chiudiScheda(int i) {
        if (i < 0 || i >= this.schede.size()) {
            return;
        }
        Scheda t = this.schede.remove(i);
        t.imgAnteprima = null;
        if (this.vista.getSession() == t.sessione) {
            this.vista.releaseSession();
        }
        try {
            t.sessione.close();
        }
        catch (Exception exception) {
            // empty catch block
        }
        if (this.schede.isEmpty()) {
            this.finish();
            return;
        }
        this.corrente = -1;
        this.mostraScheda(Math.max(0, i - 1));
    }

    private void mostraSelettore() {
        if (this.selettore != null) {
            return;
        }
        this.catturaAnteprima(this.schedaCorrente());
        FrameLayout overlay = new FrameLayout((Context)this);
        overlay.setBackgroundColor(this.SCRIM);
        overlay.setClickable(true);
        LinearLayout col = new LinearLayout((Context)this);
        col.setOrientation(1);
        LinearLayout top = new LinearLayout((Context)this);
        top.setOrientation(0);
        top.setGravity(16);
        top.setPadding(this.dp(14), this.dp(16), this.dp(14), this.dp(8));
        TextView title = new TextView((Context)this);
        title.setText((CharSequence)("Schede (" + this.schede.size() + ")"));
        title.setTextColor(this.TXT);
        title.setTextSize(2, 18.0f);
        title.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(0, -2, 1.0f));
        Button addBtn = this.iconBtn("\uff0b");
        addBtn.setOnClickListener(v -> {
            this.chiudiSelettore();
            this.nuovaScheda("https://www.google.com", false, false);
        });
        ImageView incBtn = this.iconaBtn(R.drawable.ic_incognito);
        incBtn.setOnClickListener(v -> {
            this.chiudiSelettore();
            this.nuovaScheda("https://www.google.com", true, false);
        });
        Button close = this.iconBtn("\u2715");
        close.setOnClickListener(v -> this.chiudiSelettore());
        top.addView((View)title);
        top.addView((View)addBtn);
        top.addView((View)incBtn);
        top.addView((View)close);
        ScrollView sc = new ScrollView((Context)this);
        sc.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(-1, 0, 1.0f));
        LinearLayout body = new LinearLayout((Context)this);
        body.setOrientation(1);
        body.setPadding(this.dp(8), 0, this.dp(8), this.dp(24));
        int nNorm = 0;
        int nInc = 0;
        for (Scheda t : this.schede) {
            if (t.incognito) {
                ++nInc;
                continue;
            }
            ++nNorm;
        }
        if (nNorm > 0) {
            body.addView((View)this.sectionHeader("Schede  (" + nNorm + ")", false));
            body.addView((View)this.grigliaSchede(false));
        }
        if (nInc > 0) {
            body.addView((View)this.sectionHeader("In incognito  (" + nInc + ")", true));
            body.addView((View)this.grigliaSchede(true));
        }
        sc.addView((View)body);
        col.addView((View)top);
        col.addView((View)sc);
        overlay.addView((View)col, (ViewGroup.LayoutParams)new FrameLayout.LayoutParams(-1, -1));
        this.selettore = overlay;
        ((ViewGroup)this.findViewById(0x1020002)).addView((View)overlay, (ViewGroup.LayoutParams)new FrameLayout.LayoutParams(-1, -1));
    }

    private void chiudiSelettore() {
        if (this.selettore != null && this.selettore.getParent() != null) {
            ((ViewGroup)this.selettore.getParent()).removeView((View)this.selettore);
        }
        this.selettore = null;
        for (Scheda t : this.schede) {
            t.imgAnteprima = null;
        }
    }

    private void rinfrescaSelettore() {
        if (this.selettore != null) {
            this.chiudiSelettore();
            this.mostraSelettore();
        }
    }

    private TextView sectionHeader(String text, boolean inc) {
        TextView h = new TextView((Context)this);
        h.setText((CharSequence)text);
        h.setTextColor(inc ? -4610049 : this.DIM);
        h.setTextSize(2, 13.0f);
        h.setPadding(this.dp(8), this.dp(16), this.dp(8), this.dp(6));
        return h;
    }

    private GridLayout grigliaSchede(boolean incognito) {
        GridLayout g = new GridLayout((Context)this);
        g.setColumnCount(2);
        int cardW = (this.getResources().getDisplayMetrics().widthPixels - this.dp(16) - this.dp(24)) / 2;
        int cardH = (int)((float)cardW * 1.15f);
        for (int i = 0; i < this.schede.size(); ++i) {
            if (this.schede.get((int)i).incognito != incognito) continue;
            g.addView(this.cardScheda(i, cardW, cardH));
        }
        return g;
    }

    private View cardScheda(int index, int cardW, int cardH) {
        Scheda t = this.schede.get(index);
        LinearLayout card = new LinearLayout((Context)this);
        card.setOrientation(1);
        GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
        lp.width = cardW;
        lp.height = cardH;
        lp.setMargins(this.dp(6), this.dp(6), this.dp(6), this.dp(6));
        card.setLayoutParams((ViewGroup.LayoutParams)lp);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(t.incognito ? -12962992 : this.CARD);
        cardBg.setCornerRadius((float)this.dp(14));
        if (index == this.corrente) {
            cardBg.setStroke(this.dp(2), -16087809);
        }
        card.setBackground((Drawable)cardBg);
        card.setPadding(this.dp(8), this.dp(8), this.dp(8), this.dp(8));
        LinearLayout head = new LinearLayout((Context)this);
        head.setOrientation(0);
        head.setGravity(16);
        TextView tt = new TextView((Context)this);
        tt.setText((CharSequence)(t.titolo == null || t.titolo.isEmpty() ? "Nuova scheda" : t.titolo));
        tt.setTextColor(this.TXT);
        tt.setTextSize(2, 12.0f);
        tt.setSingleLine(true);
        tt.setEllipsize(TextUtils.TruncateAt.END);
        tt.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(0, -2, 1.0f));
        TextView x = new TextView((Context)this);
        x.setText((CharSequence)"\u2715");
        x.setTextColor(this.DIM);
        x.setTextSize(2, 15.0f);
        x.setPadding(this.dp(8), this.dp(2), this.dp(2), this.dp(2));
        x.setOnClickListener(v -> {
            int idx = this.schede.indexOf(t);
            if (idx < 0) {
                return;
            }
            boolean ultima = this.schede.size() == 1;
            this.chiudiScheda(idx);
            if (!ultima) {
                this.rinfrescaSelettore();
            }
        });
        head.addView((View)tt);
        head.addView((View)x);
        ImageView img = new ImageView((Context)this);
        img.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(-1, 0, 1.0f));
        img.setScaleType(ImageView.ScaleType.FIT_START);
        GradientDrawable ph = new GradientDrawable();
        ph.setColor(t.incognito ? -14410440 : this.PH);
        ph.setCornerRadius((float)this.dp(10));
        img.setBackground((Drawable)ph);
        img.setClipToOutline(true);
        if (t.anteprima != null) {
            img.setImageBitmap(t.anteprima);
        }
        t.imgAnteprima = img;
        View gap = new View((Context)this);
        gap.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(-1, this.dp(6)));
        card.addView((View)head);
        card.addView(gap);
        card.addView((View)img);
        card.setOnClickListener(v -> {
            int idx = this.schede.indexOf(t);
            if (idx >= 0) {
                this.mostraScheda(idx);
                this.chiudiSelettore();
            }
        });
        return card;
    }

    private void catturaAnteprima(Scheda t) {
        if (t == null || t != this.schedaCorrente() || this.vista.getSession() != t.sessione) {
            return;
        }
        try {
            this.vista.capturePixels().accept(bmp -> {
                if (bmp == null) {
                    return;
                }
                t.anteprima = BrowserActivity.rimpicciolisci(bmp);
                if (t.imgAnteprima != null && t.anteprima != null) {
                    t.imgAnteprima.setImageBitmap(t.anteprima);
                }
            }, err -> Log.i((String)TAG, (String)("anteprima non catturata: " + err)));
        }
        catch (Exception e) {
            Log.i((String)TAG, (String)"anteprima non catturata", (Throwable)e);
        }
    }

    private static Bitmap rimpicciolisci(Bitmap src) {
        try {
            float scala = 0.35f;
            int w = Math.max(1, (int)((float)src.getWidth() * scala));
            int h = Math.max(1, (int)((float)src.getHeight() * scala));
            Bitmap out = Bitmap.createBitmap((int)w, (int)h, (Bitmap.Config)Bitmap.Config.RGB_565);
            Canvas c = new Canvas(out);
            c.drawColor(-1);
            c.scale(scala, scala);
            c.drawBitmap(src, 0.0f, 0.0f, null);
            src.recycle();
            return out;
        }
        catch (Exception e) {
            return null;
        }
    }

    private void mostraMenu(View anchor) {
        Scheda s = this.schedaCorrente();
        boolean bm = s != null && this.eNeiPreferiti(s.indirizzo);
        LinearLayout pannello = new LinearLayout((Context)this);
        pannello.setOrientation(1);
        GradientDrawable sfondo = new GradientDrawable();
        sfondo.setColor(this.CARD);
        sfondo.setCornerRadius((float)this.dp(14));
        pannello.setBackground((Drawable)sfondo);
        LinearLayout fila = new LinearLayout((Context)this);
        fila.setOrientation(0);
        fila.setGravity(16);
        fila.setPadding(this.dp(6), this.dp(4), this.dp(6), this.dp(4));
        fila.addView(this.iconaMenu("\u2190", s != null && s.puoTornareIndietro, v -> {
            Scheda c = this.schedaCorrente();
            if (c != null) {
                c.sessione.goBack();
            }
        }));
        fila.addView(this.iconaMenu("\u2192", s != null && s.puoAndareAvanti, v -> {
            Scheda c = this.schedaCorrente();
            if (c != null && c.puoAndareAvanti) {
                c.sessione.goForward();
            }
        }));
        fila.addView(this.iconaMenu(bm ? "\u2605" : "\u2606", s != null && !s.indirizzo.isEmpty(), v -> {
            Scheda c = this.schedaCorrente();
            if (c != null) {
                this.invertiPreferito(c.titolo, c.indirizzo);
            }
        }));
        fila.addView(this.iconaMenu("\u2b07", true, v -> this.apriDownload()));
        fila.addView(this.iconaMenu("\u27f3", s != null, v -> {
            Scheda c = this.schedaCorrente();
            if (c != null) {
                c.sessione.reload();
            }
        }));
        pannello.addView((View)fila);
        pannello.addView(this.separatore());
        pannello.addView(this.voceMenu("\uff0b", "Nuova scheda", v -> this.nuovaScheda(this.paginaIniziale(), false, false)));
        pannello.addView(this.voceMenu(R.drawable.ic_incognito, "Nuova scheda in incognito", v -> this.nuovaScheda(this.paginaIniziale(), true, false)));
        pannello.addView(this.separatore());
        pannello.addView(this.voceMenu(R.drawable.ic_history, "Cronologia", v -> this.mostraCronologia()));
        pannello.addView(this.voceMenu("\u2605", "Preferiti", v -> this.mostraPreferiti()));
        pannello.addView(this.voceMenu(bm ? "\u2605" : "\u2606", bm ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti", v -> {
            Scheda c = this.schedaCorrente();
            if (c != null) {
                this.invertiPreferito(c.titolo, c.indirizzo);
            }
        }));
        pannello.addView(this.separatore());
        pannello.addView(this.voceMenu(R.drawable.ic_find, "Trova nella pagina", v -> this.mostraBarraTrova(true)));
        pannello.addView(this.voceMenu(s != null && s.desktop ? R.drawable.ic_mobile : R.drawable.ic_desktop, s != null && s.desktop ? "Sito mobile" : "Sito desktop", v -> {
            Scheda c = this.schedaCorrente();
            if (c != null) {
                this.cambiaModalita(c, !c.desktop);
            }
        }));
        pannello.addView(this.voceMenu("\u26f6", "Schermo intero", v -> this.setSchermoIntero(true)));
        pannello.addView(this.separatore());
        pannello.addView(this.voceMenu(R.drawable.ic_share, "Condividi\u2026", v -> this.condividi(this.schedaCorrente() != null ? this.schedaCorrente().indirizzo : null)));
        pannello.addView(this.voceMenu(R.drawable.ic_globe, "Apri nel browser di sistema", v -> this.apriNelBrowserDiSistema(this.schedaCorrente() != null ? this.schedaCorrente().indirizzo : null)));
        pannello.addView(this.separatore());
        pannello.addView(this.voceMenu(R.drawable.ic_home, "Pagina iniziale", v -> this.vaiAllaHome()));
        pannello.addView(this.voceMenu(R.drawable.ic_pin, "Imposta come pagina iniziale", v -> this.impostaPaginaIniziale()));
        ScrollView contenitore = new ScrollView((Context)this);
        contenitore.addView((View)pannello);
        this.menuAperto = new PopupWindow((View)contenitore, this.dp(300), -2, true);
        this.menuAperto.setBackgroundDrawable((Drawable)new ColorDrawable(0));
        this.menuAperto.setOutsideTouchable(true);
        this.menuAperto.setElevation((float)this.dp(10));
        this.menuAperto.showAsDropDown(anchor, -this.dp(150), this.dp(6));
    }

    private void chiudiMenu() {
        if (this.menuAperto != null) {
            this.menuAperto.dismiss();
            this.menuAperto = null;
        }
    }

    private View voceMenu(int icona, String testo, View.OnClickListener azione) {
        return this.voceMenu((View)this.iconaVista(icona, 18, this.TXT), testo, azione);
    }

    private View voceMenu(String glifo, String testo, View.OnClickListener azione) {
        TextView i = new TextView((Context)this);
        i.setText((CharSequence)glifo);
        i.setTextColor(this.TXT);
        i.setTextSize(2, 15.0f);
        i.setGravity(17);
        return this.voceMenu((View)i, testo, azione);
    }

    private View voceMenu(View icona, String testo, View.OnClickListener azione) {
        LinearLayout r = new LinearLayout((Context)this);
        r.setOrientation(0);
        r.setGravity(16);
        r.setPadding(this.dp(16), this.dp(10), this.dp(16), this.dp(10));
        r.setBackgroundResource(this.sfondoTocco());
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(this.dp(18), this.dp(18));
        ilp.rightMargin = this.dp(8);
        icona.setLayoutParams((ViewGroup.LayoutParams)ilp);
        r.addView(icona);
        TextView t = new TextView((Context)this);
        t.setText((CharSequence)testo);
        t.setTextSize(2, 14.0f);
        t.setTextColor(this.TXT);
        r.addView((View)t);
        r.setOnClickListener(v -> {
            this.chiudiMenu();
            azione.onClick(v);
        });
        return r;
    }

    private View iconaMenu(String glifo, boolean attiva, View.OnClickListener azione) {
        TextView t = new TextView((Context)this);
        t.setText((CharSequence)glifo);
        t.setTextSize(2, 17.0f);
        t.setTextColor(attiva ? this.TXT : this.DIM);
        t.setGravity(17);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(this.dp(40), this.dp(40));
        lp.leftMargin = this.dp(5);
        lp.rightMargin = this.dp(5);
        t.setLayoutParams((ViewGroup.LayoutParams)lp);
        GradientDrawable cerchio = new GradientDrawable();
        cerchio.setShape(1);
        cerchio.setColor(attiva ? this.CAP : 0);
        if (attiva) {
            t.setBackground((Drawable)new RippleDrawable(ColorStateList.valueOf((int)0x33808080), (Drawable)cerchio, (Drawable)cerchio));
            t.setOnClickListener(azione);
        } else {
            t.setBackground((Drawable)cerchio);
        }
        return t;
    }

    private View separatore() {
        View v = new View((Context)this);
        v.setBackgroundColor(this.DIM);
        v.setAlpha(0.22f);
        v.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(-1, Math.max(1, this.dp(1) / 2)));
        return v;
    }

    private int sfondoTocco() {
        TypedValue v = new TypedValue();
        this.getTheme().resolveAttribute(16843534, v, true);
        return v.resourceId;
    }

    private void apriDownload() {
        try {
            this.startActivity(new Intent("android.intent.action.VIEW_DOWNLOADS"));
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"nessuna app per i download", (Throwable)e);
            Toast.makeText((Context)this, (CharSequence)"Nessuna app per i download", (int)0).show();
        }
    }

    private void cambiaModalita(Scheda s, boolean desktop) {
        s.desktop = desktop;
        GeckoSessionSettings imp = s.sessione.getSettings();
        imp.setUserAgentMode(desktop ? 1 : 0);
        imp.setUserAgentOverride(desktop ? UA_DESKTOP : null);
        imp.setViewportMode(desktop ? 1 : 0);
        s.sessione.reload();
    }

    private boolean vuoleDesktop(String url) {
        try {
            String host = Uri.parse((String)url).getHost();
            if (host == null) {
                return false;
            }
            return (host = host.toLowerCase()).contains("web.whatsapp.com") || host.contains("web.telegram.org");
        }
        catch (Exception e) {
            return false;
        }
    }

    private void naviga(String input) {
        String string = input = input == null ? "" : input.trim();
        if (input.isEmpty()) {
            return;
        }
        String url = input.matches("^[a-zA-Z][a-zA-Z0-9+.\\-]*://.*") ? input : (input.contains(".") && !input.contains(" ") ? "https://" + input : SEARCH + Uri.encode((String)input));
        Scheda s = this.schedaCorrente();
        if (s != null) {
            s.sessione.loadUri(url);
        }
        this.hideKeyboard();
        this.omnibox.clearFocus();
    }

    private void syncBar(String url) {
        Scheda s;
        if (url == null) {
            url = "";
        }
        if (!this.omnibox.hasFocus()) {
            this.omnibox.setText((CharSequence)url);
        }
        boolean inc = (s = this.schedaCorrente()) != null && s.incognito;
        boolean sicura = url.startsWith("https://");
        this.secIco.setImageResource(sicura ? R.drawable.ic_lock : R.drawable.ic_info);
        this.secIco.setColorFilter(sicura ? this.DIM : -24822, PorterDuff.Mode.SRC_IN);
        this.applicaTemaBarra(inc);
    }

    private void applicaTemaBarra(boolean inc) {
        this.bar.setBackgroundColor(inc ? -14015432 : this.BAR);
        GradientDrawable capBg = new GradientDrawable();
        capBg.setColor(inc ? -12962992 : this.CAP);
        capBg.setCornerRadius((float)this.dp(22));
        this.cap.setBackground((Drawable)capBg);
        this.incBadge.setVisibility(inc ? 0 : 8);
        this.omnibox.setHint((CharSequence)(inc ? "Cerca o digita (incognito)" : "Cerca o digita un indirizzo"));
    }

    public void onLocationChange(GeckoSession s, String url, List<GeckoSession.PermissionDelegate.ContentPermission> permessi, Boolean gestoUtente) {
        Scheda t = this.schedaDi(s);
        if (t == null) {
            return;
        }
        String string = t.indirizzo = url == null ? "" : url;
        if (s == this.sessioneInVista()) {
            this.syncBar(t.indirizzo);
        }
    }

    public void onCanGoBack(GeckoSession s, boolean valore) {
        Scheda t = this.schedaDi(s);
        if (t != null) {
            t.puoTornareIndietro = valore;
        }
    }

    public void onCanGoForward(GeckoSession s, boolean valore) {
        Scheda t = this.schedaDi(s);
        if (t != null) {
            t.puoAndareAvanti = valore;
        }
    }

    public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, GeckoSession.NavigationDelegate.LoadRequest richiesta) {
        String u;
        String string = u = richiesta.uri == null ? "" : richiesta.uri;
        if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("about:") || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("file:")) {
            return GeckoResult.allow();
        }
        try {
            Intent i = new Intent("android.intent.action.VIEW", Uri.parse((String)u));
            i.addFlags(0x10000000);
            this.startActivity(i);
        }
        catch (Exception e) {
            Log.i((String)TAG, (String)("schema non gestito da nessuna app: " + u), (Throwable)e);
        }
        return GeckoResult.deny();
    }

    public GeckoResult<GeckoSession> onNewSession(GeckoSession s, String uri) {
        Scheda t = this.schedaDi(s);
        boolean inc = t != null && t.incognito;
        boolean desk = t != null && t.desktop;
        Scheda nuova = this.schedaNonAperta(inc, desk);
        this.mostraScheda(this.schede.size() - 1);
        return GeckoResult.fromValue(nuova.sessione);
    }

    public GeckoResult<String> onLoadError(GeckoSession s, String uri, WebRequestError errore) {
        Scheda t = this.schedaDi(s);
        Log.w((String)TAG, (String)("caricamento fallito: " + uri + " codice=" + errore.code));
        if (s == this.sessioneInVista()) {
            this.progress.setVisibility(8);
            Toast.makeText((Context)this, (CharSequence)"Impossibile caricare la pagina", (int)0).show();
        }
        if (t != null) {
            t.titolo = "Impossibile caricare la pagina";
        }
        return null;
    }

    public void onPageStart(GeckoSession s, String url) {
        if (s == this.sessioneInVista()) {
            this.progress.setVisibility(0);
            this.progress.setProgress(0);
        }
    }

    public void onPageStop(GeckoSession s, boolean riuscito) {
        Scheda t = this.schedaDi(s);
        if (t == null) {
            return;
        }
        if (s == this.sessioneInVista()) {
            this.progress.setVisibility(8);
            this.syncBar(t.indirizzo);
        }
        if (riuscito && !t.incognito) {
            this.addCronologia(t.titolo, t.indirizzo);
        }
    }

    public void onProgressChange(GeckoSession s, int p) {
        if (s != this.sessioneInVista()) {
            return;
        }
        if (p < 100) {
            this.progress.setVisibility(0);
            this.progress.setProgress(p);
        } else {
            this.progress.setVisibility(8);
        }
    }

    public void onTitleChange(GeckoSession s, String titolo) {
        Scheda t = this.schedaDi(s);
        if (t != null && titolo != null && !titolo.isEmpty()) {
            t.titolo = titolo;
        }
    }

    public void onCloseRequest(GeckoSession s) {
        int idx = -1;
        for (int i = 0; i < this.schede.size(); ++i) {
            if (this.schede.get((int)i).sessione != s) continue;
            idx = i;
        }
        if (idx >= 0) {
            this.chiudiScheda(idx);
        }
    }

    public void onCrash(GeckoSession s) {
        Log.e((String)TAG, (String)"il processo di contenuto \u00e8 andato in crash");
        Scheda t = this.schedaDi(s);
        Toast.makeText((Context)this, (CharSequence)"La pagina \u00e8 andata in crash: la ricarico", (int)0).show();
        if (t != null) {
            s.reload();
        }
    }

    public void onExternalResponse(GeckoSession s, WebResponse risposta) {
        String nome = BrowserActivity.nomeDelFile(risposta);
        String mime = BrowserActivity.mimeDi(risposta);
        InputStream flusso = risposta.body;
        if (flusso == null) {
            Toast.makeText((Context)this, (CharSequence)"Download non riuscito", (int)0).show();
            return;
        }
        new Thread(() -> {
            String esito = null;
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put("_display_name", nome);
                    cv.put("mime_type", mime);
                    cv.put("is_pending", Integer.valueOf(1));
                    Uri uri = this.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) {
                        throw new IOException("MediaStore non ha accettato il file");
                    }
                    OutputStream out = this.getContentResolver().openOutputStream(uri);
                    BrowserActivity.copia(flusso, out);
                    cv.clear();
                    cv.put("is_pending", Integer.valueOf(0));
                    this.getContentResolver().update(uri, cv, null, null);
                    esito = "Download/" + nome;
                } else {
                    File dir = this.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) {
                        throw new IOException("nessuna cartella per i download");
                    }
                    if (!dir.exists() && !dir.mkdirs()) {
                        throw new IOException("cartella non creata");
                    }
                    File f = new File(dir, nome);
                    FileOutputStream fo = new FileOutputStream(f);
                    BrowserActivity.copia(flusso, fo);
                    esito = f.getAbsolutePath();
                }
            }
            catch (Exception e) {
                Log.e((String)TAG, (String)"download non riuscito", (Throwable)e);
            }
            finally {
                try {
                    flusso.close();
                }
                catch (Exception e) {}
            }
            String dove = esito;
            this.runOnUiThread(() -> Toast.makeText((Context)this, (CharSequence)(dove == null ? "Download non riuscito" : "Scaricato in " + dove), (int)1).show());
        }, "nova-download").start();
    }

    private static void copia(InputStream in, OutputStream out) throws Exception {
        int n;
        byte[] buf = new byte[65536];
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        out.flush();
        out.close();
    }

    private static String nomeDelFile(WebResponse r) {
        int i;
        String cd;
        String nome = null;
        String string = cd = r.headers == null ? null : (String)r.headers.get("Content-Disposition");
        if (cd != null && (i = cd.toLowerCase().indexOf("filename=")) >= 0) {
            nome = cd.substring(i + 9).trim();
            if (nome.startsWith("\"")) {
                int fine = nome.indexOf(34, 1);
                nome = fine > 0 ? nome.substring(1, fine) : nome.substring(1);
            } else {
                int punto = nome.indexOf(59);
                if (punto > 0) {
                    nome = nome.substring(0, punto);
                }
            }
        }
        if (nome == null || nome.trim().isEmpty()) {
            int s;
            String u = r.uri == null ? "" : r.uri;
            int q = u.indexOf(63);
            if (q >= 0) {
                u = u.substring(0, q);
            }
            nome = (s = u.lastIndexOf(47)) >= 0 ? u.substring(s + 1) : u;
        }
        try {
            nome = URLDecoder.decode(nome, "UTF-8");
        }
        catch (Exception exception) {
            // empty catch block
        }
        nome = nome.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return nome.isEmpty() ? "download" : nome;
    }

    private static String mimeDi(WebResponse r) {
        String ct;
        String string = ct = r.headers == null ? null : (String)r.headers.get("Content-Type");
        if (ct == null || ct.trim().isEmpty()) {
            return "application/octet-stream";
        }
        int punto = ct.indexOf(59);
        return (punto > 0 ? ct.substring(0, punto) : ct).trim();
    }

    private static String titoloDi(String t) {
        return t == null || t.isEmpty() ? "La pagina dice" : t;
    }

    public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onAlertPrompt(GeckoSession s, GeckoSession.PromptDelegate.AlertPrompt p) {
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> esito = new GeckoResult<>();
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)BrowserActivity.titoloDi(p.title)).setMessage((CharSequence)(p.message == null ? "" : p.message)).setPositiveButton((CharSequence)"OK", (d, w) -> esito.complete(p.dismiss())).setOnCancelListener(d -> esito.complete(p.dismiss())).show();
        return esito;
    }

    public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onButtonPrompt(GeckoSession s, GeckoSession.PromptDelegate.ButtonPrompt p) {
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> esito = new GeckoResult<>();
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)BrowserActivity.titoloDi(p.title)).setMessage((CharSequence)(p.message == null ? "" : p.message)).setPositiveButton((CharSequence)"OK", (d, w) -> esito.complete(p.confirm(0))).setNegativeButton((CharSequence)"Annulla", (d, w) -> esito.complete(p.confirm(2))).setOnCancelListener(d -> esito.complete(p.confirm(2))).show();
        return esito;
    }

    public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onTextPrompt(GeckoSession s, GeckoSession.PromptDelegate.TextPrompt p) {
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> esito = new GeckoResult<>();
        EditText campo = new EditText((Context)this);
        campo.setText((CharSequence)(p.defaultValue == null ? "" : p.defaultValue));
        campo.setSelectAllOnFocus(true);
        int pad = this.dp(18);
        FrameLayout box = new FrameLayout((Context)this);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView((View)campo);
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)BrowserActivity.titoloDi(p.title)).setMessage((CharSequence)(p.message == null ? "" : p.message)).setView((View)box).setPositiveButton((CharSequence)"OK", (d, w) -> esito.complete(p.confirm(campo.getText().toString()))).setNegativeButton((CharSequence)"Annulla", (d, w) -> esito.complete(p.dismiss())).setOnCancelListener(d -> esito.complete(p.dismiss())).show();
        return esito;
    }

    public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onBeforeUnloadPrompt(GeckoSession s, GeckoSession.PromptDelegate.BeforeUnloadPrompt p) {
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> esito = new GeckoResult<>();
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)"Uscire dalla pagina?").setMessage((CharSequence)"I dati inseriti nel modulo potrebbero andare persi.").setPositiveButton((CharSequence)"Esci", (d, w) -> esito.complete(p.confirm(AllowOrDeny.ALLOW))).setNegativeButton((CharSequence)"Resta", (d, w) -> esito.complete(p.confirm(AllowOrDeny.DENY))).setOnCancelListener(d -> esito.complete(p.confirm(AllowOrDeny.DENY))).show();
        return esito;
    }

    public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onPopupPrompt(GeckoSession s, GeckoSession.PromptDelegate.PopupPrompt p) {
        return GeckoResult.fromValue(p.confirm(AllowOrDeny.ALLOW));
    }

    public GeckoResult<GeckoSession.PromptDelegate.PromptResponse> onFilePrompt(GeckoSession s, GeckoSession.PromptDelegate.FilePrompt p) {
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> esito = new GeckoResult<>();
        this.fileInAttesa = p;
        this.esitoFile = esito;
        this.svuotaCaricamenti();
        try {
            Intent i = new Intent("android.intent.action.OPEN_DOCUMENT");
            i.addCategory("android.intent.category.OPENABLE");
            i.setType("*/*");
            if (!(p.mimeTypes == null || p.mimeTypes.length <= 0 || p.mimeTypes.length == 1 && "*/*".equals(p.mimeTypes[0]))) {
                i.putExtra("android.intent.extra.MIME_TYPES", p.mimeTypes);
            }
            i.putExtra("android.intent.extra.ALLOW_MULTIPLE", true);
            this.startActivityForResult(i, 4801);
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"nessuna app per scegliere un file", (Throwable)e);
            this.fileInAttesa = null;
            this.esitoFile = null;
            esito.complete(p.dismiss());
        }
        return esito;
    }

    protected void onActivityResult(int codice, int esito, Intent dati) {
        super.onActivityResult(codice, esito, dati);
        if (codice != 4801) {
            return;
        }
        GeckoSession.PromptDelegate.FilePrompt p = this.fileInAttesa;
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> r = this.esitoFile;
        this.fileInAttesa = null;
        this.esitoFile = null;
        if (p == null || r == null) {
            return;
        }
        if (esito != -1 || dati == null) {
            r.complete(p.dismiss());
            return;
        }
        ArrayList<Uri> scelti = new ArrayList<Uri>();
        if (dati.getClipData() != null) {
            for (int i = 0; i < dati.getClipData().getItemCount(); ++i) {
                Uri u = dati.getClipData().getItemAt(i).getUri();
                if (u == null) continue;
                scelti.add(u);
            }
        } else if (dati.getData() != null) {
            scelti.add(dati.getData());
        }
        if (scelti.isEmpty()) {
            r.complete(p.dismiss());
            return;
        }
        ArrayList<Uri> locali = new ArrayList<Uri>();
        for (Uri u : scelti) {
            Uri locale = this.copiaInCache(u);
            if (locale == null) continue;
            locali.add(locale);
        }
        if (locali.isEmpty()) {
            r.complete(p.dismiss());
        } else {
            r.complete(p.confirm((Context)this, locali.toArray(new Uri[0])));
        }
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     * Enabled aggressive block sorting
     * Enabled unnecessary exception pruning
     * Enabled aggressive exception aggregation
     */
    private Uri copiaInCache(Uri origine) {
        if (origine == null) {
            return null;
        }
        if ("file".equals(origine.getScheme())) {
            return origine;
        }
        InputStream in = null;
        FileOutputStream out = null;
        try {
            File cartella = new File(this.getCacheDir(), CARTELLA_CARICAMENTI);
            if (!cartella.exists() && !cartella.mkdirs()) {
                Uri uri = null;
                return uri;
            }
            File destinazione = new File(cartella, this.nomeDelFile(origine));
            in = this.getContentResolver().openInputStream(origine);
            if (in == null) {
                Uri uri = null;
                return uri;
            }
            out = new FileOutputStream(destinazione);
            BrowserActivity.copia(in, out);
            out = null;
            Uri uri = Uri.fromFile((File)destinazione);
            return uri;
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)("il file scelto non si \u00e8 potuto copiare: " + origine), (Throwable)e);
            Uri uri = null;
            return uri;
        }
        finally {
            try {
                if (in != null) {
                    in.close();
                }
            }
            catch (Exception exception) {}
            try {
                if (out != null) {
                    out.close();
                }
            }
            catch (Exception exception) {}
        }
    }

    /*
     * Enabled aggressive block sorting
     * Enabled unnecessary exception pruning
     * Enabled aggressive exception aggregation
     */
    private String nomeDelFile(Uri u) {
        try (Cursor c2222 = this.getContentResolver().query(u, null, null, null, null);){
            String n;
            int i;
            if (c2222 != null && c2222.moveToFirst() && (i = c2222.getColumnIndex("_display_name")) >= 0 && (n = c2222.getString(i)) != null && !n.trim().isEmpty()) {
                String string = BrowserActivity.nomeSicuro(n);
                return string;
            }
        }
        catch (Exception c2222) {
            // empty catch block
        }
        String ultimo = u.getLastPathSegment();
        if (ultimo == null) return "allegato";
        if (ultimo.isEmpty()) return "allegato";
        String string = BrowserActivity.nomeSicuro(ultimo);
        return string;
    }

    private static String nomeSicuro(String n) {
        String pulito = n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (pulito.isEmpty() || ".".equals(pulito) || "..".equals(pulito)) {
            return "allegato";
        }
        return pulito;
    }

    private void svuotaCaricamenti() {
        File cartella = new File(this.getCacheDir(), CARTELLA_CARICAMENTI);
        File[] dentro = cartella.listFiles();
        if (dentro == null) {
            return;
        }
        for (File f : dentro) {
            if (f.delete()) continue;
            Log.i((String)TAG, (String)("file temporaneo non cancellato: " + f.getName()));
        }
    }

    private void unPermessoAllaVolta(Runnable richiesta) {
        if (this.permessiInCorso) {
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

    public void onMediaPermissionRequest(GeckoSession s, String uri, GeckoSession.PermissionDelegate.MediaSource[] video, GeckoSession.PermissionDelegate.MediaSource[] audio, GeckoSession.PermissionDelegate.MediaCallback callback) {
        if (this.mediaInAttesa != null) {
            callback.reject();
            return;
        }
        this.mediaInAttesa = callback;
        this.videoInAttesa = video;
        this.audioInAttesa = audio;
        this.unPermessoAllaVolta(this::chiediCameraEMicrofono);
    }

    private void chiediCameraEMicrofono() {
        if (this.mediaInAttesa == null) {
            this.turnoSuccessivoDeiPermessi();
            return;
        }
        boolean vuoleVideo = this.videoInAttesa != null && this.videoInAttesa.length > 0;
        boolean vuoleAudio = this.audioInAttesa != null && this.audioInAttesa.length > 0;
        ArrayList<String> mancanti = new ArrayList<String>();
        if (vuoleAudio && this.checkSelfPermission("android.permission.RECORD_AUDIO") != 0) {
            mancanti.add("android.permission.RECORD_AUDIO");
        }
        if (vuoleVideo && this.checkSelfPermission("android.permission.CAMERA") != 0) {
            mancanti.add("android.permission.CAMERA");
        }
        if (mancanti.isEmpty()) {
            this.rispondiAiMedia(true);
            this.turnoSuccessivoDeiPermessi();
            return;
        }
        this.requestPermissions(mancanti.toArray(new String[0]), 4811);
    }

    private void rispondiAiMedia(boolean concesso) {
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

    public GeckoResult<Integer> onContentPermissionRequest(GeckoSession s, GeckoSession.PermissionDelegate.ContentPermission richiesta) {
        if (richiesta.permission == 0) {
            GeckoResult<Integer> esito;
            if (this.checkSelfPermission("android.permission.ACCESS_FINE_LOCATION") == 0) {
                return GeckoResult.fromValue(1);
            }
            this.posizioneInAttesa = esito = new GeckoResult();
            this.unPermessoAllaVolta(() -> this.requestPermissions(new String[]{"android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"}, 4812));
            return esito;
        }
        if (richiesta.permission == 1) {
            return GeckoResult.fromValue(2);
        }
        return GeckoResult.fromValue(1);
    }

    public void onAndroidPermissionsRequest(GeckoSession s, String[] richiesti, GeckoSession.PermissionDelegate.Callback callback) {
        if (richiesti == null || richiesti.length == 0) {
            callback.grant();
            return;
        }
        ArrayList<String> mancanti = new ArrayList<String>();
        for (String p : richiesti) {
            if (this.checkSelfPermission(p) == 0) continue;
            mancanti.add(p);
        }
        if (mancanti.isEmpty()) {
            callback.grant();
            return;
        }
        GeckoSession.PermissionDelegate.Callback cb = callback;
        this.unPermessoAllaVolta(() -> {
            this.callbackInAttesa = cb;
            this.requestPermissions(mancanti.toArray(new String[0]), 4813);
        });
    }

    public void onRequestPermissionsResult(int codice, String[] permessi, int[] esiti) {
        super.onRequestPermissionsResult(codice, permessi, esiti);
        boolean tutti = esiti.length > 0;
        for (int e : esiti) {
            if (e == 0) continue;
            tutti = false;
        }
        if (codice == 4811) {
            this.rispondiAiMedia(tutti);
        } else if (codice == 4812) {
            GeckoResult<Integer> r = this.posizioneInAttesa;
            this.posizioneInAttesa = null;
            if (r != null) {
                r.complete((tutti ? 1 : 2));
            }
        } else if (codice == 4813) {
            GeckoSession.PermissionDelegate.Callback cb = this.callbackInAttesa;
            this.callbackInAttesa = null;
            if (cb != null) {
                if (tutti) {
                    cb.grant();
                } else {
                    cb.reject();
                }
            }
        }
        this.turnoSuccessivoDeiPermessi();
    }

    private LinearLayout buildFindBar() {
        LinearLayout f = new LinearLayout((Context)this);
        f.setOrientation(0);
        f.setGravity(16);
        f.setBackgroundColor(this.BAR);
        f.setPadding(this.dp(12), this.dp(6), this.dp(8), this.dp(6));
        f.setVisibility(8);
        this.findInput = new EditText((Context)this);
        this.findInput.setSingleLine(true);
        this.findInput.setHint((CharSequence)"Trova nella pagina");
        this.findInput.setHintTextColor(this.DIM);
        this.findInput.setTextColor(this.TXT);
        this.findInput.setBackgroundColor(0);
        this.findInput.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(0, -2, 1.0f));
        this.findInput.addTextChangedListener(new TextWatcher(){

            public void beforeTextChanged(CharSequence s, int a, int b, int c) {
            }

            public void onTextChanged(CharSequence s, int a, int b, int c) {
                BrowserActivity.this.trova(s.toString(), true);
            }

            public void afterTextChanged(Editable s) {
            }
        });
        this.findInfo = new TextView((Context)this);
        this.findInfo.setTextColor(this.DIM);
        this.findInfo.setTextSize(2, 12.0f);
        this.findInfo.setPadding(this.dp(6), 0, this.dp(6), 0);
        Button prev = this.iconBtn("\u2191");
        prev.setOnClickListener(v -> this.trova(this.findInput.getText().toString(), false));
        Button next = this.iconBtn("\u2193");
        next.setOnClickListener(v -> this.trova(this.findInput.getText().toString(), true));
        Button x = this.iconBtn("\u2715");
        x.setOnClickListener(v -> this.mostraBarraTrova(false));
        f.addView((View)this.findInput);
        f.addView((View)this.findInfo);
        f.addView((View)prev);
        f.addView((View)next);
        f.addView((View)x);
        return f;
    }

    private void trova(String testo, boolean avanti) {
        Scheda t = this.schedaCorrente();
        if (t == null) {
            return;
        }
        if (testo == null) {
            testo = "";
        }
        if (testo.isEmpty()) {
            t.sessione.getFinder().clear();
            this.findInfo.setText((CharSequence)"");
            return;
        }
        int flag = avanti ? 0 : 1;
        t.sessione.getFinder().find(testo, flag).accept(r -> this.findInfo.setText((CharSequence)(r == null || !r.found ? "0/0" : r.current + "/" + r.total)), err -> this.findInfo.setText((CharSequence)"0/0"));
    }

    private void mostraBarraTrova(boolean mostra) {
        this.findBar.setVisibility(mostra ? 0 : 8);
        if (mostra) {
            this.findInput.requestFocus();
        } else {
            Scheda t = this.schedaCorrente();
            if (t != null) {
                t.sessione.getFinder().clear();
            }
            this.findInput.setText((CharSequence)"");
            this.findInfo.setText((CharSequence)"");
            this.hideKeyboard();
        }
    }

    private SharedPreferences prefs() {
        return this.getSharedPreferences("novaos", 0);
    }

    private String paginaIniziale() {
        String v = this.prefs().getString(PREF_HOME, "");
        if (v == null) {
            v = "";
        }
        if ((v = v.trim()).length() >= 2 && v.charAt(0) == '\"' && v.endsWith("\"")) {
            try {
                v = new JSONTokener(v).nextValue().toString().trim();
            }
            catch (Exception exception) {
                // empty catch block
            }
        }
        if (v.isEmpty()) {
            return HOME_PREDEFINITA;
        }
        return v.matches("^[a-zA-Z][a-zA-Z0-9+.-]*:.*") ? v : "https://" + v;
    }

    private void vaiAllaHome() {
        Scheda s = this.schedaCorrente();
        String u = this.paginaIniziale();
        if (s == null) {
            this.nuovaScheda(u, false, false);
        } else {
            s.sessione.loadUri(u);
        }
    }

    private void impostaPaginaIniziale() {
        String u;
        Scheda s = this.schedaCorrente();
        String string = u = s == null ? null : s.indirizzo;
        if (u == null || u.isEmpty() || u.startsWith("about:")) {
            Toast.makeText((Context)this, (CharSequence)"Apri prima una pagina da usare come pagina iniziale", (int)0).show();
            return;
        }
        this.prefs().edit().putString(PREF_HOME, JSONObject.quote((String)u)).apply();
        Toast.makeText((Context)this, (CharSequence)"Pagina iniziale impostata", (int)0).show();
    }

    private JSONArray arr(String k) {
        try {
            return new JSONArray(this.prefs().getString("nova:" + k, "[]"));
        }
        catch (Exception e) {
            return new JSONArray();
        }
    }

    private void putArr(String k, JSONArray a) {
        this.prefs().edit().putString("nova:" + k, a.toString()).apply();
    }

    private static String nomePreferito(JSONObject o) {
        String n = o.optString("name", "");
        if (n.isEmpty()) {
            n = o.optString("title", "");
        }
        if (n.isEmpty()) {
            n = o.optString("url");
        }
        return n;
    }

    private void addPreferito(String titolo, String url) {
        if (url == null || url.isEmpty()) {
            return;
        }
        try {
            JSONArray a = this.arr("bookmarks");
            for (int i = 0; i < a.length(); ++i) {
                if (!url.equals(a.getJSONObject(i).optString("url"))) continue;
                Toast.makeText((Context)this, (CharSequence)"Gi\u00e0 nei preferiti", (int)0).show();
                return;
            }
            JSONObject o = new JSONObject();
            o.put("name", (Object)(titolo == null || titolo.isEmpty() ? url : titolo));
            o.put("url", (Object)url);
            a.put((Object)o);
            this.putArr("bookmarks", a);
            Toast.makeText((Context)this, (CharSequence)"Aggiunto ai preferiti", (int)0).show();
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"preferito non salvato", (Throwable)e);
        }
    }

    private void addCronologia(String titolo, String url) {
        if (url == null || url.isEmpty() || url.startsWith("data:")) {
            return;
        }
        try {
            JSONArray a = this.arr("browserHistory");
            JSONArray out = new JSONArray();
            JSONObject o = new JSONObject();
            o.put("url", (Object)url);
            o.put("t", System.currentTimeMillis());
            out.put((Object)o);
            for (int i = 0; i < a.length() && out.length() < 30; ++i) {
                JSONObject e = a.getJSONObject(i);
                if (url.equals(e.optString("url"))) continue;
                out.put((Object)e);
            }
            this.putArr("browserHistory", out);
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"cronologia non aggiornata", (Throwable)e);
        }
    }

    private boolean eNeiPreferiti(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }
        JSONArray a = this.arr("bookmarks");
        for (int i = 0; i < a.length(); ++i) {
            JSONObject o = a.optJSONObject(i);
            if (o == null || !url.equals(o.optString("url"))) continue;
            return true;
        }
        return false;
    }

    private void invertiPreferito(String titolo, String url) {
        if (url == null || url.isEmpty()) {
            return;
        }
        if (this.eNeiPreferiti(url)) {
            this.rimuoviPreferito(url);
            Toast.makeText((Context)this, (CharSequence)"Rimosso dai preferiti", (int)0).show();
        } else {
            this.addPreferito(titolo, url);
        }
    }

    private void rimuoviPreferito(String url) {
        try {
            JSONArray a = this.arr("bookmarks");
            JSONArray out = new JSONArray();
            for (int i = 0; i < a.length(); ++i) {
                JSONObject o = a.getJSONObject(i);
                if (url.equals(o.optString("url"))) continue;
                out.put((Object)o);
            }
            this.putArr("bookmarks", out);
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"preferito non rimosso", (Throwable)e);
        }
    }

    private void rimuoviPreferitoIndice(int idx) {
        try {
            JSONArray a = this.arr("bookmarks");
            JSONArray out = new JSONArray();
            for (int i = 0; i < a.length(); ++i) {
                if (i == idx) continue;
                out.put(a.get(i));
            }
            this.putArr("bookmarks", out);
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"preferito non rimosso", (Throwable)e);
        }
    }

    private void mostraPreferiti() {
        JSONArray a = this.arr("bookmarks");
        int n = a.length();
        if (n == 0) {
            new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)"Preferiti").setMessage((CharSequence)"Nessun preferito.\nApri un sito e usa \u2606 Aggiungi ai preferiti dal menu.").setNegativeButton((CharSequence)"Chiudi", null).show();
            return;
        }
        CharSequence[] labels = new String[n];
        for (int i = 0; i < n; ++i) {
            JSONObject o = a.optJSONObject(i);
            labels[i] = "\u2605  " + (o != null ? BrowserActivity.nomePreferito(o) : "");
        }
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)("Preferiti (" + n + ")")).setItems(labels, (d, w) -> this.azioniPreferito(w)).setNegativeButton((CharSequence)"Chiudi", null).show();
    }

    private void azioniPreferito(int idx) {
        JSONArray a = this.arr("bookmarks");
        JSONObject o = a.optJSONObject(idx);
        if (o == null) {
            return;
        }
        String titolo = BrowserActivity.nomePreferito(o);
        String url = o.optString("url");
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)titolo).setItems((CharSequence[])new String[]{"Apri", "Apri in nuova scheda", "Rinomina", "Elimina"}, (d, w) -> {
            switch (w) {
                case 0: {
                    Scheda s = this.schedaCorrente();
                    if (s == null) break;
                    s.sessione.loadUri(url);
                    break;
                }
                case 1: {
                    this.nuovaScheda(url, false, false);
                    break;
                }
                case 2: {
                    this.rinominaPreferito(idx);
                    break;
                }
                case 3: {
                    this.rimuoviPreferitoIndice(idx);
                    Toast.makeText((Context)this, (CharSequence)"Preferito eliminato", (int)0).show();
                }
            }
        }).setNegativeButton((CharSequence)"Annulla", null).show();
    }

    private void rinominaPreferito(int idx) {
        JSONArray a = this.arr("bookmarks");
        JSONObject o = a.optJSONObject(idx);
        if (o == null) {
            return;
        }
        EditText in = new EditText((Context)this);
        in.setText((CharSequence)BrowserActivity.nomePreferito(o));
        in.setSelectAllOnFocus(true);
        int pad = this.dp(18);
        FrameLayout box = new FrameLayout((Context)this);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView((View)in);
        new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)"Rinomina preferito").setView((View)box).setPositiveButton((CharSequence)"Salva", (d, w) -> {
            try {
                JSONArray b = this.arr("bookmarks");
                JSONObject bo = b.optJSONObject(idx);
                if (bo != null) {
                    String t = in.getText().toString().trim();
                    bo.put("name", (Object)(t.isEmpty() ? bo.optString("url") : t));
                    this.putArr("bookmarks", b);
                }
            }
            catch (Exception e) {
                Log.w((String)TAG, (String)"rinomina non salvata", (Throwable)e);
            }
        }).setNegativeButton((CharSequence)"Annulla", null).show();
    }

    private void mostraCronologia() {
        JSONArray a = this.arr("browserHistory");
        int n = a.length();
        CharSequence[] labels = new String[n];
        String[] urls = new String[n];
        for (int i = 0; i < n; ++i) {
            JSONObject o = a.optJSONObject(i);
            urls[i] = o != null ? o.optString("url") : "";
            labels[i] = urls[i];
        }
        AlertDialog.Builder bld = new AlertDialog.Builder((Context)this, 4).setTitle((CharSequence)"Cronologia");
        if (n == 0) {
            bld.setMessage((CharSequence)"Nessuna cronologia.");
        } else {
            bld.setItems(labels, (d, w) -> {
                Scheda s = this.schedaCorrente();
                if (s != null) {
                    s.sessione.loadUri(urls[w]);
                }
            });
        }
        if (n > 0) {
            bld.setNeutralButton((CharSequence)"Cancella", (d, w) -> this.putArr("browserHistory", new JSONArray()));
        }
        bld.setNegativeButton((CharSequence)"Chiudi", null).show();
    }

    private void condividi(String url) {
        if (url == null || url.isEmpty()) {
            return;
        }
        Intent i = new Intent("android.intent.action.SEND");
        i.setType("text/plain");
        i.putExtra("android.intent.extra.TEXT", url);
        this.startActivity(Intent.createChooser((Intent)i, (CharSequence)"Condividi"));
    }

    private void apriNelBrowserDiSistema(String url) {
        if (url == null || url.isEmpty()) {
            return;
        }
        try {
            Intent i = new Intent("android.intent.action.VIEW", Uri.parse((String)url));
            i.addCategory("android.intent.category.BROWSABLE");
            i.setFlags(0x10000000);
            this.startActivity(i);
        }
        catch (Exception e) {
            Toast.makeText((Context)this, (CharSequence)"Nessun browser disponibile sul dispositivo", (int)0).show();
        }
    }

    private LinearLayout radice() {
        try {
            return (LinearLayout)((ViewGroup)this.findViewById(0x1020002)).getChildAt(0);
        }
        catch (Exception e) {
            return null;
        }
    }

    private Button iconBtn(String glyph) {
        Button b = new Button((Context)this);
        b.setText((CharSequence)glyph);
        b.setAllCaps(false);
        b.setBackgroundColor(0);
        b.setTextColor(this.TXT);
        b.setTextSize(2, 17.0f);
        b.setMinWidth(this.dp(40));
        b.setMinimumWidth(this.dp(40));
        b.setPadding(this.dp(6), 0, this.dp(6), 0);
        return b;
    }

    private ImageView iconaVista(int icona, int lato, int colore) {
        ImageView v = new ImageView((Context)this);
        v.setImageResource(icona);
        v.setColorFilter(colore, PorterDuff.Mode.SRC_IN);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setLayoutParams((ViewGroup.LayoutParams)new LinearLayout.LayoutParams(this.dp(lato), this.dp(lato)));
        return v;
    }

    private ImageView iconaBtn(int icona) {
        ImageView v = this.iconaVista(icona, 40, this.TXT);
        v.setScaleType(ImageView.ScaleType.CENTER);
        GradientDrawable cerchio = new GradientDrawable();
        cerchio.setShape(1);
        cerchio.setColor(-1);
        v.setBackground((Drawable)new RippleDrawable(ColorStateList.valueOf((int)0x33808080), null, (Drawable)cerchio));
        v.setFocusable(false);
        return v;
    }

    private GradientDrawable squareBadge() {
        GradientDrawable g = new GradientDrawable();
        g.setStroke(this.dp(2), this.DIM);
        g.setCornerRadius((float)this.dp(5));
        g.setColor(0);
        return g;
    }

    private int dp(int v) {
        return (int)((float)v * this.getResources().getDisplayMetrics().density + 0.5f);
    }

    private void hideKeyboard() {
        try {
            InputMethodManager im = (InputMethodManager)this.getSystemService("input_method");
            im.hideSoftInputFromWindow(this.omnibox.getWindowToken(), 0);
        }
        catch (Exception exception) {
            // empty catch block
        }
    }

    public void onBackPressed() {
        if (this.selettore != null) {
            this.chiudiSelettore();
            return;
        }
        if (this.fullscreen) {
            this.setSchermoIntero(false);
            return;
        }
        if (this.findBar.getVisibility() == 0) {
            this.mostraBarraTrova(false);
            return;
        }
        Scheda s = this.schedaCorrente();
        if (s != null && s.puoTornareIndietro) {
            s.sessione.goBack();
        } else if (this.schede.size() > 1) {
            this.chiudiScheda(this.corrente);
        } else {
            super.onBackPressed();
        }
    }

    protected void onDestroy() {
        try {
            this.vista.releaseSession();
        }
        catch (Exception exception) {
            // empty catch block
        }
        for (Scheda t : this.schede) {
            try {
                t.sessione.close();
            }
            catch (Exception exception) {}
        }
        this.schede.clear();
        super.onDestroy();
    }

    private void setSchermoIntero(boolean on) {
        this.fullscreen = on;
        this.bar.setVisibility(on ? 8 : 0);
        this.progress.setVisibility(8);
        View decor = this.getWindow().getDecorView();
        if (on) {
            decor.setSystemUiVisibility(5894);
            this.addRestoreButton();
        } else {
            decor.setSystemUiVisibility(0);
            if (this.fsRestore != null && this.fsRestore.getParent() != null) {
                ((ViewGroup)this.fsRestore.getParent()).removeView((View)this.fsRestore);
            }
            this.fsRestore = null;
        }
    }

    private void addRestoreButton() {
        if (this.fsRestore != null) {
            return;
        }
        this.fsRestore = new Button((Context)this);
        this.fsRestore.setText((CharSequence)"\u2922");
        this.fsRestore.setTextColor(this.TXT);
        this.fsRestore.setAllCaps(false);
        this.fsRestore.setTextSize(2, 18.0f);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(-872415232);
        bg.setCornerRadius((float)this.dp(24));
        this.fsRestore.setBackground((Drawable)bg);
        this.fsRestore.setOnClickListener(v -> this.setSchermoIntero(false));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(this.dp(48), this.dp(48));
        lp.gravity = 0x800055;
        lp.rightMargin = this.dp(14);
        lp.bottomMargin = this.dp(20);
        ((ViewGroup)this.findViewById(0x1020002)).addView((View)this.fsRestore, (ViewGroup.LayoutParams)lp);
    }

    private static class Scheda {
        GeckoSession sessione;
        String titolo = "Nuova scheda";
        String indirizzo = "";
        boolean puoTornareIndietro;
        boolean puoAndareAvanti;
        boolean incognito = false;
        boolean desktop = false;
        Bitmap anteprima;
        ImageView imgAnteprima;

        private Scheda() {
        }
    }
}

