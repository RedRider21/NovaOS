package os.nova.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewGroup.LayoutParams;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * Il browser di NovaOS.
 *
 * <p>È lo stesso browser della traccia Gecko ({@code :gecko}), sull'altro motore: la
 * schermata, le icone, il menu, i preferiti condivisi con la shell, la scelta dei file e i
 * permessi di camera, microfono e posizione sono gli stessi. Quello che cambia è cosa c'è
 * sotto — e cambia in meglio, perché la WebView è un motore e una scatola insieme: sa dire
 * da sé cosa sta mostrando ({@code getUrl()}, {@code getTitle()}, {@code canGoBack()}) e
 * disegnare la propria anteprima, quindi metà del lavoro che Gecko ha richiesto qui non
 * esiste. Le differenze che restano sono tre, e sono tutte a sfavore della WebView:
 *
 * <ul>
 *   <li><b>Una vista per scheda.</b> La WebView non si può spostare fra due contenitori
 *       restando la stessa: qui ogni scheda ha la sua, e cambiare scheda vuol dire staccare
 *       una vista e agganciarne un'altra. Dieci schede costano dieci superfici di disegno.</li>
 *   <li><b>I popup passano da {@code onCreateWindow}</b>, che consegna un messaggio da
 *       rimandare indietro con la WebView che dovrà disegnare la pagina nuova. Se non lo si
 *       fa, {@code window.open} resta appeso senza errore.</li>
 *   <li><b>I download</b> passano dal {@code DownloadListener}, che consegna solo un
 *       indirizzo: il file lo scarica il sistema, senza i cookie della sessione (un PDF
 *       dietro login non si scarica). Sotto Gecko arriva lo stream già aperto. È un limite
 *       dichiarato, non una scelta.</li>
 * </ul>
 *
 * <p>Aperto via {@code window.NovaNative.openBrowser(url)}.
 */
public class BrowserActivity extends Activity {

    private static final String TAG = "NovaBrowser";

    // ---- una scheda del browser ----
    private static class Scheda {
        WebView web;
        String titolo = "Nuova scheda";
        String indirizzo = "";
        boolean incognito = false;
        boolean desktop = false;
        Bitmap anteprima;   // per il selettore schede
    }

    private FrameLayout selettore;   // selettore schede a griglia (null = chiuso)
    private PopupWindow menuAperto;  // il pannello di ⋮, quando è aperto

    private final List<Scheda> schede = new ArrayList<>();
    private int corrente = -1;

    private FrameLayout holder;      // contiene la WebView della scheda attiva
    private EditText omnibox;        // barra indirizzo/ricerca editabile
    private ImageView secIco;        // lucchetto / «i» sicurezza, accanto all'indirizzo
    private Button tabBtn;           // contatore schede -> selettore
    private LinearLayout bar;        // barra superiore (tema chiaro/incognito)
    private LinearLayout cap;        // capsula omnibox
    private ImageView incBadge;      // occhiali: la scheda in vista è in incognito
    private ProgressBar progress;    // avanzamento caricamento
    private LinearLayout findBar;    // barra "trova nella pagina"
    private EditText findInput;
    private TextView findInfo;       // "3/12": quante occorrenze e quale si sta guardando

    private String mobileUa;

    private static final int ACC = 0xFF0a84ff;
    private static final String SEARCH = "https://www.google.com/search?q=";

    /** Dove porta la casa finché non si sceglie una pagina iniziale. */
    private static final String HOME_PREDEFINITA = "https://www.google.com/";

    /** Il browser desktop. Non è la stringa di un altro browser: è quella con cui questi
     *  siti si comportavano bene qui, e cambiarla cambierebbe l'impaginazione dei siti che
     *  leggono il nome del browser. */
    private static final String UA_DESKTOP =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

    // Palette dinamica: segue il tema di NovaOS (chiaro/scuro), impostata da initTheme().
    // BG=sfondo, BAR=barra, TXT=testo, DIM=testo attenuato, CAP=capsula omnibox,
    // CARD=scheda nel selettore, PH=placeholder anteprima.
    private int BG, BAR, TXT, DIM, CAP, CARD, PH;
    // tema incognito (barra scura viola, capsula più scura) — sempre scuro
    private static final int INC_BG = 0xFF17141f, INC_BAR = 0xFF2a2438, INC_CAP = 0xFF3a3350;
    // Testo e icone dell'incognito: servono per forza, non si ricavano dal tema. La barra
    // dell'incognito è scura sempre, mentre la palette qui sopra segue NovaOS — con NovaOS
    // in chiaro il testo della barra era nero su viola scuro, cioè quasi invisibile.
    private static final int INC_TXT = 0xFFeceaf4, INC_DIM = 0xFFb3aec6, INC_CARD = 0xFF231d33;

    // Viste che devono cambiare colore quando cambia la palette in uso (il tema di NovaOS,
    // oppure quella dell'incognito): si registrano mentre si costruiscono — sono poche e
    // note — invece di andarle a cercare a ogni cambio.
    private final List<TextView> testiTema = new ArrayList<>();
    private final List<ImageView> iconeTema = new ArrayList<>();
    private Button reloadBtn, piuBtn, menuBtn;
    // La stella dei preferiti del menu. Il pannello resta aperto quando la si tocca, quindi
    // la stella va aggiornata sul posto: una stella che non cambia si legge come «non è
    // successo niente», ed è il difetto che questa coppia di riferimenti chiude.
    private TextView stellaFila, stellaVoceIcona, stellaVoceTesto;
    // Palette del pannello del menu mentre lo si costruisce (segue la scheda in vista).
    private int pCard, pCap, pTxt, pDim;

    /** Legge il tema salvato da NovaOS (SharedPreferences "novaos", chiave nova:theme)
     *  e sceglie la palette chiara o scura, per andare di pari passo con il resto del sistema. */
    private void initTheme() {
        String t = getSharedPreferences("novaos", MODE_PRIVATE).getString("nova:theme", "\"dark\"");
        boolean light = t != null && t.contains("light");
        if (light) {
            BG = 0xFFf2f4f8; BAR = 0xFFffffff; TXT = 0xFF141a24; DIM = 0xFF5b6472;
            CAP = 0xFFe9edf3; CARD = 0xFFffffff; PH = 0xFFe4e8ef;
        } else {
            BG = 0xFF0b0f17; BAR = 0xFF151a24; TXT = 0xFFe8ecf4; DIM = 0xFF9aa4b8;
            CAP = 0xFF232937; CARD = 0xFF1c2331; PH = 0xFF0f141d;
        }
        // Il menu non è ancora costruito: la sua palette parte da quella del tema e viene
        // sostituita all'apertura, se la scheda in vista è in incognito.
        pCard = CARD; pCap = CAP; pTxt = TXT; pDim = DIM;
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        initTheme();   // palette in base al tema di NovaOS, prima di costruire la UI

        LinearLayout rootv = new LinearLayout(this);
        rootv.setOrientation(LinearLayout.VERTICAL);
        rootv.setBackgroundColor(BG);

        // ---- barra superiore: [casa] [ omnibox ] [＋] [contatore] [⋮] ----
        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BAR);
        bar.setPadding(dp(8), dp(10), dp(8), dp(10));

        // Occhiali «in incognito»: visibili solo quando la scheda in vista è in incognito.
        // Accanto al contatore delle schede, non in mezzo alle altre icone, perché dicono
        // della scheda che il contatore conta.
        incBadge = iconaVista(R.drawable.ic_incognito, 20, TXT);
        incBadge.setPadding(dp(2), 0, dp(2), 0);
        incBadge.setVisibility(View.GONE);

        tabBtn = new Button(this);
        tabBtn.setText("1");
        tabBtn.setAllCaps(false);
        tabBtn.setBackground(squareBadge());
        tabBtn.setTextColor(TXT);
        tabBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tabBtn.setMinWidth(dp(34)); tabBtn.setMinimumWidth(dp(34));
        tabBtn.setPadding(dp(4), 0, dp(4), 0);
        tabBtn.setOnClickListener(v -> mostraSelettore());

        // capsula omnibox
        cap = new LinearLayout(this);
        cap.setOrientation(LinearLayout.HORIZONTAL);
        cap.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable capBg = new GradientDrawable();
        capBg.setColor(CAP); capBg.setCornerRadius(dp(22));
        cap.setBackground(capBg);
        cap.setPadding(dp(14), 0, dp(6), 0);
        LinearLayout.LayoutParams capLp = new LinearLayout.LayoutParams(0, dp(42), 1f);
        capLp.leftMargin = dp(6); capLp.rightMargin = dp(4);
        cap.setLayoutParams(capLp);

        secIco = iconaVista(R.drawable.ic_lock, 15, DIM);   // colore suo: lo decide syncBar

        omnibox = new EditText(this);
        omnibox.setSingleLine(true);
        omnibox.setBackgroundColor(Color.TRANSPARENT);
        omnibox.setTextColor(TXT);
        omnibox.setHint("Cerca o digita un indirizzo");
        omnibox.setHintTextColor(DIM);
        omnibox.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        omnibox.setInputType(InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        // Il fuoco lo prende il dito, non l'avvio della schermata: senza questa riga è il
        // primo campo dell'Activity a riceverlo, e da quel momento «il campo ha il fuoco»
        // smette di voler dire «l'utente sta scrivendo» — cioè syncBar non aggiorna più
        // l'indirizzo, e dopo un cambio scheda resta lì quello vecchio, selezionato.
        omnibox.setFocusableInTouchMode(true);
        omnibox.setImeOptions(EditorInfo.IME_ACTION_GO);
        omnibox.setPadding(dp(10), 0, dp(6), 0);
        omnibox.setLayoutParams(new LinearLayout.LayoutParams(0, LayoutParams.MATCH_PARENT, 1f));
        omnibox.setOnEditorActionListener((tv, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_NULL) { naviga(omnibox.getText().toString()); return true; }
            return false;
        });
        omnibox.setOnFocusChangeListener((v, has) -> { if (has) omnibox.selectAll(); });

        reloadBtn = iconBtn("⟳");
        reloadBtn.setOnClickListener(v -> { Scheda s = schedaCorrente(); if (s != null && s.web != null) s.web.reload(); });

        cap.addView(secIco);
        cap.addView(omnibox);
        cap.addView(reloadBtn);
        testiTema.add(reloadBtn);

        // casa: riporta alla pagina iniziale. È il primo elemento della barra: la si
        // cerca a sinistra dell'omnibox, non in mezzo alle altre icone.
        ImageView casa = iconaBtn(R.drawable.ic_home);
        casa.setOnClickListener(v -> vaiAllaHome());
        iconeTema.add(casa);
        // Gli occhiali dell'incognito stanno nella stessa fila: la visibilità la decide
        // applicaTemaBarra, il colore lo ricevono come le altre icone.
        iconeTema.add(incBadge);

        // ＋ apre una scheda nuova. La stella dei preferiti non sta più qui: era l'unica
        // icona che cambiava aspetto da sola a ogni pagina, e il preferito si aggiunge
        // dalle due voci del menu (che si aprono da ⋮).
        piuBtn = iconBtn("＋");
        piuBtn.setOnClickListener(v -> nuovaScheda(paginaIniziale(), false, false));

        menuBtn = iconBtn("⋮");
        menuBtn.setOnClickListener(this::mostraMenu);

        // L'ordine della fila: la casa a sinistra (è lì che la si cerca),
        // l'omnibox a prendersi lo spazio che avanza, ＋ subito dopo, e in fondo il
        // contatore delle schede attaccato a ⋮ — con gli occhiali dell'incognito accanto,
        // perché dicono della scheda che il contatore conta.
        bar.addView(casa);
        bar.addView(cap);
        bar.addView(piuBtn);
        bar.addView(incBadge);
        bar.addView(tabBtn);
        bar.addView(menuBtn);
        testiTema.add(piuBtn);
        testiTema.add(menuBtn);

        // barra di avanzamento
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(3)));
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(ACC));
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(BAR));
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

        // La schermata nasce con il fuoco in nessun campo, e non sull'omnibox.
        //
        // Il fuoco è la sola spia che abbiamo di «l'utente sta scrivendo»: syncBar aggiorna
        // l'indirizzo solo se il campo non ha il fuoco, perché altrimenti le notifiche di
        // caricamento cancellerebbero quello che si sta digitando. Ma in touch mode il primo
        // campo dell'Activity è anche il primo a prendere il fuoco da solo: la schermata si
        // apriva con l'omnibox vuota e focalizzata, e l'indirizzo non ci finiva mai — una
        // barra che sembra rotta mentre la pagina è già lì. Il fuoco lo prende il
        // contenitore, che non ha nulla da mostrare.
        rootv.setFocusableInTouchMode(true);
        rootv.requestFocus();

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = HOME_PREDEFINITA;
        if (!url.matches("^[a-zA-Z]+://.*")) url = "https://" + url;
        boolean desk = getIntent().getBooleanExtra("desktop", false) || vuoleDesktop(url);
        nuovaScheda(url, false, desk);
    }

    // ------------------------------------------------------------------ schede
    private Scheda schedaCorrente() { return corrente >= 0 && corrente < schede.size() ? schede.get(corrente) : null; }

    private Scheda nuovaScheda(String url, boolean incognito, boolean desktop) {
        Scheda t = new Scheda();
        t.incognito = incognito;
        t.desktop = desktop;
        t.web = buildWebView(t);
        schede.add(t);
        mostraScheda(schede.size() - 1);
        if (url != null && !url.isEmpty()) { t.indirizzo = url; t.web.loadUrl(url); }
        return t;
    }

    /**
     * Aggancia la scheda indicata: la sua WebView va nel contenitore, quella che si lascia
     * ne esce.
     *
     * <p>L'anteprima della scheda che si sta lasciando si cattura <b>prima</b> dello scambio:
     * è ancora a schermo, quindi il disegno è quello giusto. È la stessa ragione per cui
     * sotto Gecko la si cattura prima di staccare la sessione.
     */
    private void mostraScheda(int i) {
        if (i < 0 || i >= schede.size()) return;
        if (corrente >= 0 && corrente < schede.size() && corrente != i) catturaAnteprima(schede.get(corrente));
        corrente = i;
        Scheda t = schede.get(i);
        holder.removeAllViews();
        if (t.web.getParent() != null) ((ViewGroup) t.web.getParent()).removeView(t.web);
        holder.addView(t.web, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        tabBtn.setText(String.valueOf(schede.size()));
        LinearLayout rv = radice();
        if (rv != null) rv.setBackgroundColor(t.incognito ? INC_BG : BG);
        // Cambio scheda: l'indirizzo della scheda che si apre deve comparire subito, anche se
        // il campo aveva il fuoco. Chi sta scrivendo lo perde, ed è giusto: ha appena scelto
        // un'altra scheda.
        omnibox.clearFocus();
        syncBar(t.indirizzo);
    }

    private void chiudiScheda(int i) {
        if (i < 0 || i >= schede.size()) return;
        Scheda t = schede.remove(i);
        holder.removeAllViews();
        try { t.web.destroy(); } catch (Exception e) { /* già distrutta */ }
        if (schede.isEmpty()) { finish(); return; }
        corrente = -1;
        mostraScheda(Math.max(0, i - 1));
    }

    // ---- selettore schede: griglia di anteprime con X per chiudere ----
    private void mostraSelettore() {
        if (selettore != null) return;
        catturaAnteprima(schedaCorrente());   // anteprima aggiornata della scheda corrente

        FrameLayout overlay = new FrameLayout(this);
        // Opaco, non un velo: sotto c'è la barra del browser, e con un velo al 95% la si
        // vede trasparire dietro il titolo — due barre sovrapposte, con dentro due volte
        // lo stesso conto delle schede.
        overlay.setBackgroundColor(BG);
        overlay.setClickable(true);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);

        // barra superiore: titolo + nuova scheda + nuova incognito + chiudi
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(14), dp(16), dp(14), dp(8));
        TextView title = new TextView(this);
        // Senza il numero: il conto lo dà già l'intestazione di ciascun gruppo qui sotto,
        // e ripeterlo due volte nella stessa schermata sembra un errore.
        title.setText("Schede");
        title.setTextColor(TXT); title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setLayoutParams(new LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f));
        Button addBtn = iconBtn("＋"); addBtn.setOnClickListener(v -> { chiudiSelettore(); nuovaScheda(HOME_PREDEFINITA, false, false); });
        ImageView incBtn = iconaBtn(R.drawable.ic_incognito); incBtn.setOnClickListener(v -> { chiudiSelettore(); nuovaScheda(HOME_PREDEFINITA, true, false); });
        Button close = iconBtn("✕");  close.setOnClickListener(v -> chiudiSelettore());
        top.addView(title); top.addView(addBtn); top.addView(incBtn); top.addView(close);

        ScrollView sc = new ScrollView(this);
        sc.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(8), 0, dp(8), dp(24));

        int nNorm = 0, nInc = 0; for (Scheda t : schede) { if (t.incognito) nInc++; else nNorm++; }
        if (nNorm > 0) { body.addView(sectionHeader("Schede  (" + nNorm + ")", false)); body.addView(grigliaSchede(false)); }
        if (nInc > 0)  { body.addView(sectionHeader("In incognito  (" + nInc + ")", true)); body.addView(grigliaSchede(true)); }

        sc.addView(body);
        col.addView(top); col.addView(sc);
        overlay.addView(col, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        selettore = overlay;
        ((ViewGroup) findViewById(android.R.id.content)).addView(overlay,
            new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    }

    private void chiudiSelettore() {
        if (selettore != null && selettore.getParent() != null) ((ViewGroup) selettore.getParent()).removeView(selettore);
        selettore = null;
    }
    private void rinfrescaSelettore() { if (selettore != null) { chiudiSelettore(); mostraSelettore(); } }

    private TextView sectionHeader(String text, boolean inc) {
        TextView h = new TextView(this);
        h.setText(text);
        h.setTextColor(inc ? 0xFFb9a7ff : DIM);
        h.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        h.setPadding(dp(8), dp(16), dp(8), dp(6));
        return h;
    }

    private GridLayout grigliaSchede(boolean incognito) {
        GridLayout g = new GridLayout(this);
        g.setColumnCount(2);
        int cardW = (getResources().getDisplayMetrics().widthPixels - dp(16) - dp(24)) / 2;
        int cardH = (int) (cardW * 1.15f);
        for (int i = 0; i < schede.size(); i++) {
            if (schede.get(i).incognito != incognito) continue;
            g.addView(cardScheda(i, cardW, cardH));
        }
        return g;
    }

    private View cardScheda(int index, int cardW, int cardH) {
        final Scheda t = schede.get(index);
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
        lp.width = cardW; lp.height = cardH; lp.setMargins(dp(6), dp(6), dp(6), dp(6));
        card.setLayoutParams(lp);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(t.incognito ? INC_CAP : CARD);
        cardBg.setCornerRadius(dp(14));
        if (index == corrente) cardBg.setStroke(dp(2), ACC);
        card.setBackground(cardBg);
        card.setPadding(dp(8), dp(8), dp(8), dp(8));

        // intestazione: titolo + X per chiudere la singola scheda
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView tt = new TextView(this);
        tt.setText(t.titolo == null || t.titolo.isEmpty() ? "Nuova scheda" : t.titolo);
        // La casella di una scheda in incognito è scura anche col tema chiaro: il titolo
        // segue la casella, non il tema, altrimenti è testo scuro su viola scuro.
        tt.setTextColor(t.incognito ? INC_TXT : TXT);
        tt.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        tt.setSingleLine(true); tt.setEllipsize(TextUtils.TruncateAt.END);
        tt.setLayoutParams(new LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f));
        TextView x = new TextView(this);
        x.setText("✕"); x.setTextColor(t.incognito ? INC_DIM : DIM);
        x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        x.setPadding(dp(8), dp(2), dp(2), dp(2));
        x.setOnClickListener(v -> {
            int idx = schede.indexOf(t);
            if (idx < 0) return;
            boolean ultima = schede.size() == 1;
            chiudiScheda(idx);
            if (!ultima) rinfrescaSelettore();
        });
        head.addView(tt); head.addView(x);

        // anteprima della pagina (bitmap catturata) o placeholder colorato
        ImageView img = new ImageView(this);
        img.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));
        GradientDrawable ph = new GradientDrawable();
        ph.setColor(t.incognito ? 0xFF241d38 : PH); ph.setCornerRadius(dp(10));
        img.setBackground(ph);
        img.setClipToOutline(true);
        if (t.anteprima != null) {
            // La pagina è una striscia verticale, la casella è più larga che alta: con
            // l'adattamento normale l'anteprima si rimpicciolirebbe fino a entrare in
            // altezza, lasciando metà casella vuota. Qui si ingrandisce quanto basta a
            // riempire la larghezza e si tiene la cima della pagina — che è la parte da
            // cui si riconosce una scheda — tagliando il resto sotto.
            img.setScaleType(ImageView.ScaleType.MATRIX);
            android.graphics.Matrix m = new android.graphics.Matrix();
            float scala = (float) (cardW - dp(16)) / t.anteprima.getWidth();
            m.setScale(scala, scala);
            img.setImageMatrix(m);
            img.setImageBitmap(t.anteprima);
        }

        View gap = new View(this); gap.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(6)));
        card.addView(head); card.addView(gap); card.addView(img);
        card.setOnClickListener(v -> { int idx = schede.indexOf(t); if (idx >= 0) { mostraScheda(idx); chiudiSelettore(); } });
        return card;
    }

    /**
     * Cattura l'anteprima della pagina della scheda.
     *
     * <p>Sotto WebView è una fotografia sincrona: si disegna la vista su una tela. Funziona
     * per la scheda che è a schermo — quella che si sta lasciando o quella corrente — ed è
     * anche il motivo per cui si cattura sempre <b>prima</b> di cambiare scheda: una vista
     * staccata dal contenitore non ha nulla da disegnare.
     *
     * <p>La bitmap che ne esce è grande quanto lo schermo: si rimpicciolisce qui, perché nel
     * selettore si vede a un terzo e tenerla intera significherebbe dieci bitmap grandi
     * quanto lo schermo in memoria.
     */
    private void catturaAnteprima(Scheda t) {
        if (t == null || t.web == null) return;
        try {
            int w = t.web.getWidth(), h = t.web.getHeight();
            if (w <= 0 || h <= 0) return;
            float scala = 0.35f;
            Bitmap bmp = Bitmap.createBitmap(Math.max(1, (int) (w * scala)), Math.max(1, (int) (h * scala)), Bitmap.Config.RGB_565);
            Canvas c = new Canvas(bmp);
            c.drawColor(Color.WHITE);
            c.scale(scala, scala);
            t.web.draw(c);
            t.anteprima = bmp;
        } catch (Exception e) {
            Log.i(TAG, "anteprima non catturata", e);
        }
    }

    // ------------------------------------------------------------------ menu
    private void mostraMenu(View anchor) {
        Scheda s = schedaCorrente();
        boolean bm = s != null && eNeiPreferiti(s.indirizzo);
        boolean indice = s != null && !s.indirizzo.isEmpty();
        boolean indietro = s != null && s.web != null && s.web.canGoBack();
        boolean avanti = s != null && s.web != null && s.web.canGoForward();

        // La palette del pannello segue la scheda in vista: in incognito è quella scura,
        // altrimenti sarebbe un rettangolo chiaro con dentro testo scuro su una barra viola.
        // Il pannello si ricostruisce da zero: i riferimenti alle stelle sono quelli che
        // sta per costruire, non quelli del pannello precedente.
        stellaFila = null; stellaVoceIcona = null; stellaVoceTesto = null;
        boolean inc = s != null && s.incognito;
        pCard = inc ? INC_CARD : CARD;
        pCap  = inc ? INC_CAP  : CAP;
        pTxt  = inc ? INC_TXT  : TXT;
        pDim  = inc ? INC_DIM  : DIM;

        LinearLayout pannello = new LinearLayout(this);
        pannello.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable sfondo = new GradientDrawable();
        sfondo.setColor(pCard);
        sfondo.setCornerRadius(dp(14));
        pannello.setBackground(sfondo);

        // ---- fila di icone: agiscono sulla pagina, non aprono altre schermate ----
        LinearLayout fila = new LinearLayout(this);
        fila.setOrientation(LinearLayout.HORIZONTAL);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        fila.setPadding(dp(6), dp(4), dp(6), dp(4));
        fila.addView(iconaMenu("←", indietro,
                v -> { Scheda c = schedaCorrente(); if (c != null && c.web.canGoBack()) c.web.goBack(); }));
        fila.addView(iconaMenu("→", avanti,
                v -> { Scheda c = schedaCorrente(); if (c != null && c.web.canGoForward()) c.web.goForward(); }));
        stellaFila = iconaMenu(bm ? "★" : "☆", indice, this::invertiPreferitoDaMenu);
        stellaFila.setTextColor(bm ? ACC : pTxt);   // blu quando la pagina è salvata
        fila.addView(stellaFila);
        fila.addView(iconaMenu("⬇", true, v -> apriDownload()));
        fila.addView(iconaMenu("⟳", s != null,
                v -> { Scheda c = schedaCorrente(); if (c != null && c.web != null) c.web.reload(); }));
        pannello.addView(fila);
        pannello.addView(separatore());

        // ---- voci, raggruppate per argomento: le righe di luce sono la sola cosa che dice
        // dove finisce un gruppo e comincia il prossimo ----
        pannello.addView(voceMenu("＋", "Nuova scheda",
                v -> nuovaScheda(paginaIniziale(), false, false)));
        pannello.addView(voceMenu(R.drawable.ic_incognito, "Nuova scheda in incognito",
                v -> nuovaScheda(paginaIniziale(), true, false)));
        pannello.addView(separatore());
        pannello.addView(voceMenu(R.drawable.ic_history, "Cronologia", v -> mostraCronologia()));
        pannello.addView(voceMenu("★", "Preferiti", v -> mostraPreferiti()));
        // La voce dei preferiti: si tengono i riferimenti alle sue due parti, perché al
        // tocco la stella deve cambiare aspetto sul posto.
        stellaVoceIcona = glifoMenu(bm ? "★" : "☆");
        stellaVoceIcona.setTextColor(bm ? ACC : pTxt);
        stellaVoceTesto = etichettaMenu(bm ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti");
        pannello.addView(voceMenu(stellaVoceIcona, stellaVoceTesto, this::invertiPreferitoDaMenu));
        pannello.addView(separatore());
        pannello.addView(voceMenu(R.drawable.ic_find, "Trova nella pagina", v -> mostraBarraTrova(true)));
        pannello.addView(voceMenu(s != null && s.desktop ? R.drawable.ic_mobile : R.drawable.ic_desktop,
                s != null && s.desktop ? "Sito mobile" : "Sito desktop",
                v -> { Scheda c = schedaCorrente(); if (c != null) cambiaModalita(c, !c.desktop); }));
        pannello.addView(voceMenu(R.drawable.ic_fullscreen, "Schermo intero", v -> setSchermoIntero(true)));
        pannello.addView(separatore());
        pannello.addView(voceMenu(R.drawable.ic_share, "Condividi…",
                v -> condividi(schedaCorrente() != null ? schedaCorrente().indirizzo : null)));
        pannello.addView(voceMenu(R.drawable.ic_globe, "Apri nel browser di sistema",
                v -> apriNelBrowserDiSistema(schedaCorrente() != null ? schedaCorrente().indirizzo : null)));
        pannello.addView(separatore());
        pannello.addView(voceMenu(R.drawable.ic_home, "Pagina iniziale", v -> vaiAllaHome()));
        pannello.addView(voceMenu(R.drawable.ic_pin, "Imposta come pagina iniziale", v -> impostaPaginaIniziale()));

        ScrollView contenitore = new ScrollView(this);
        contenitore.addView(pannello);
        // La larghezza del pannello e dove appoggiarlo.
        //
        // Il pannello si aggancia al ⋮, ma il ⋮ è l'ultima icona della barra: appoggiandolo
        // lì si spingerebbe fuori dallo schermo di tutta la sua larghezza. Si aggancia
        // quindi al bordo destro, con un margine, e lo scarto si calcola dalla posizione
        // vera dell'ancora — così vale su qualunque schermo invece che su uno solo.
        int larghezza = Math.min(dp(300), getResources().getDisplayMetrics().widthPixels - dp(16));
        int[] dove = new int[2];
        anchor.getLocationOnScreen(dove);
        int scarto = getResources().getDisplayMetrics().widthPixels - larghezza - dp(8) - dove[0];
        menuAperto = new PopupWindow(contenitore, larghezza, LayoutParams.WRAP_CONTENT, true);
        menuAperto.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        menuAperto.setOutsideTouchable(true);
        menuAperto.setElevation(dp(10));
        menuAperto.showAsDropDown(anchor, scarto, dp(6));
    }

    /**
     * Chiude il menu, se è aperto.
     *
     * <p>Il pannello non è un {@link android.widget.PopupMenu}, che si congeda da sé appena
     * una voce è scelta: è una finestra nostra, e una finestra nostra resta aperta finché
     * qualcuno non la chiude. Senza questa riga ogni voce lasciava il menu aperto sopra la
     * schermata che aveva appena aperto — e «Trova nella pagina» finiva sotto le sue stesse
     * voci.
     */
    private void chiudiMenu() {
        if (menuAperto != null) { menuAperto.dismiss(); menuAperto = null; }
    }

    /** Una voce con l'icona disegnata ({@code res/drawable/ic_*.xml}), non un carattere. */
    private View voceMenu(int icona, String testo, View.OnClickListener azione) {
        return voceMenu(iconaVista(icona, 18, pTxt), etichettaMenu(testo), azione);
    }

    /** Il testo di una voce, col colore della palette in uso. */
    private TextView etichettaMenu(String testo) {
        TextView t = new TextView(this);
        t.setText(testo);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.setTextColor(pTxt);
        return t;
    }

    /** Il glifo che fa da icona a una voce, quando non c'è un disegno. */
    private TextView glifoMenu(String glifo) {
        TextView i = new TextView(this);
        i.setText(glifo);
        i.setTextColor(pTxt);
        i.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        i.setGravity(Gravity.CENTER);
        return i;
    }

    /**
     * Una voce con un glifo di testo al posto dell'icona disegnata.
     *
     * <p>Restano a carattere le poche forme che il carattere rende già piene e regolari —
     * la stella, la croce, lo schermo intero, il più — perché sono un tratto solo e non
     * hanno bisogno di un disegno. Le altre (la casa, il lucchetto, gli occhiali, la lente…)
     * sarebbero emoji: a colori, fuori misura e diverse da un telefono all'altro, quindi
     * disegnate.
     */
    private View voceMenu(String glifo, String testo, View.OnClickListener azione) {
        return voceMenu(glifoMenu(glifo), etichettaMenu(testo), azione);
    }

    /**
     * Una voce del menu: icona a sinistra, testo accanto.
     *
     * <p>L'icona sta in una casella di 18 dp seguita da 8 dp di vuoto, invece di essere
     * incollata al testo: le voci si leggono in colonna solo se tutti i testi cominciano
     * alla stessa ascissa, e un glifo e un disegno non sono mai larghi uguale.
     */
    private View voceMenu(View icona, TextView testo, View.OnClickListener azione) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(16), dp(10), dp(16), dp(10));
        r.setBackgroundResource(sfondoTocco());

        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(18), dp(18));
        ilp.rightMargin = dp(8);
        icona.setLayoutParams(ilp);
        r.addView(icona);
        r.addView(testo);

        r.setOnClickListener(v -> { chiudiMenu(); azione.onClick(v); });
        return r;
    }

    /** Un'icona della fila in alto: cerchio chiaro attorno, spenta se l'azione non c'è. */
    private TextView iconaMenu(String glifo, boolean attiva, View.OnClickListener azione) {
        TextView t = new TextView(this);
        t.setText(glifo);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        t.setTextColor(attiva ? pTxt : pDim);
        t.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
        lp.leftMargin = dp(5); lp.rightMargin = dp(5);
        t.setLayoutParams(lp);

        GradientDrawable cerchio = new GradientDrawable();
        cerchio.setShape(GradientDrawable.OVAL);
        cerchio.setColor(attiva ? pCap : Color.TRANSPARENT);
        if (attiva) {
            // il tocco si accende dentro il cerchio, non nel rettangolo attorno
            t.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33808080), cerchio, cerchio));
            t.setOnClickListener(azione);
        } else {
            t.setBackground(cerchio);
        }
        return t;
    }

    /** La riga di luce che separa due gruppi di voci. */
    private View separatore() {
        View v = new View(this);
        v.setBackgroundColor(pDim);
        v.setAlpha(0.22f);
        v.setLayoutParams(new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, Math.max(1, dp(1) / 2)));
        return v;
    }

    /** Lo sfondo che si accende al tocco: è il «ripple» del tema, non un colore nostro. */
    private int sfondoTocco() {
        TypedValue v = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, v, true);
        return v.resourceId;
    }

    /**
     * Porta ai download di sistema.
     *
     * <p>I file che questa schermata salva finiscono nella cartella Download (v. il
     * {@code DownloadListener}): l'elenco dei download non è una schermata che abbiamo,
     * quindi l'icona della freccia in giù porta dove i file stanno davvero, invece di aprire
     * una lista vuota fatta in casa.
     */
    private void apriDownload() {
        try {
            startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS));
        } catch (Exception e) {
            Log.w(TAG, "nessuna app per i download", e);
            Toast.makeText(this, "Nessuna app per i download", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Passa una scheda da sito mobile a sito desktop e viceversa.
     *
     * <p>Sotto WebView cambia una cosa sola — la stringa del browser — perché la larghezza
     * della vista la decide il sito leggendo quella. Sotto Gecko ne cambiano due (la stringa
     * e la larghezza dichiarata), e non è una differenza di stile: è il motivo per cui la
     * stessa voce è scritta in due modi nei due file.
     */
    private void cambiaModalita(Scheda s, boolean desktop) {
        s.desktop = desktop;
        applicaUa(s);
        if (s.web != null) s.web.reload();
    }

    private void applicaUa(Scheda t) {
        if (t == null || t.web == null) return;
        WebSettings s = t.web.getSettings();
        if (mobileUa == null) mobileUa = s.getUserAgentString() + " NovaOS";
        if (t.desktop) s.setUserAgentString(UA_DESKTOP);
        else s.setUserAgentString(mobileUa);
        // La vista desktop si dichiara anche alla pagina: senza, il sito si impagina da
        // telefono anche con la stringa da computer.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
    }

    private boolean vuoleDesktop(String url) {
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            return host.contains("web.whatsapp.com") || host.contains("web.telegram.org");
        } catch (Exception e) { return false; }
    }

    // ------------------------------------------------------------------ navigazione
    private void naviga(String input) {
        input = input == null ? "" : input.trim();
        if (input.isEmpty()) return;
        String url;
        if (input.matches("^[a-zA-Z][a-zA-Z0-9+.\\-]*://.*")) url = input;
        else if (input.contains(".") && !input.contains(" ")) url = "https://" + input;
        else url = SEARCH + Uri.encode(input);
        Scheda s = schedaCorrente();
        if (s != null && s.web != null) s.web.loadUrl(url);
        hideKeyboard();
        omnibox.clearFocus();
    }

    private void syncBar(String url) {
        if (url == null) url = "";
        if (!omnibox.hasFocus()) omnibox.setText(url);
        Scheda s = schedaCorrente();
        boolean inc = s != null && s.incognito;
        boolean sicura = url.startsWith("https://");
        secIco.setImageResource(sicura ? R.drawable.ic_lock : R.drawable.ic_info);
        // Il lucchetto segue la palette della barra: in incognito quella chiara del tema
        // sarebbe invisibile sul viola scuro.
        secIco.setColorFilter(sicura ? (inc ? INC_DIM : DIM) : 0xFFff9f0a, PorterDuff.Mode.SRC_IN);
        applicaTemaBarra(inc);
    }

    /** La scheda in vista è in incognito? */
    private boolean incognitoInVista() {
        Scheda s = schedaCorrente();
        return s != null && s.incognito;
    }

    /**
     * Colora la barra secondo la palette in uso: quella di NovaOS, oppure quella
     * dell'incognito (barra scura viola).
     *
     * <p>Non è solo lo sfondo: in incognito cambiano <b>anche i testi e le icone</b>, perché
     * la barra è scura comunque mentre il tema di NovaOS può essere chiaro. Tingere solo lo
     * sfondo lasciava il testo nero su viola scuro — si vedeva la barra e non quello che
     * c'era scritto.
     */
    private void applicaTemaBarra(boolean inc) {
        int cBar = inc ? INC_BAR : BAR;
        int cCap = inc ? INC_CAP : CAP;
        int cTxt = inc ? INC_TXT : TXT;
        int cDim = inc ? INC_DIM : DIM;

        bar.setBackgroundColor(cBar);
        GradientDrawable capBg = new GradientDrawable();
        capBg.setColor(cCap); capBg.setCornerRadius(dp(22));
        cap.setBackground(capBg);
        omnibox.setTextColor(cTxt);
        omnibox.setHintTextColor(cDim);
        omnibox.setHint(inc ? "Cerca o digita (incognito)" : "Cerca o digita un indirizzo");
        incBadge.setVisibility(inc ? View.VISIBLE : View.GONE);
        tabBtn.setTextColor(cTxt);
        tabBtn.setBackground(squareBadge(cDim));
        for (TextView t : testiTema) t.setTextColor(cTxt);
        for (ImageView i : iconeTema) i.setColorFilter(cTxt, PorterDuff.Mode.SRC_IN);

        // La barra «trova» è la seconda riga della stessa testata, e la riga di
        // avanzamento ne è il bordo inferiore: seguono la stessa palette.
        findBar.setBackgroundColor(cBar);
        findInfo.setTextColor(cDim);
        findInput.setTextColor(cTxt);
        findInput.setHintTextColor(cDim);
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(cBar));

        // La stella dei preferiti ha un colore suo (blu quando la pagina è salvata) che
        // non è né quello del testo né quello delle icone: si ricalcola qui.
        aggiornaStellaUI();
    }

    // ================================================================== il motore
    // Una WebView per scheda, con i suoi due client. I client sono scritti dentro
    // buildWebView perché devono sapere a quale scheda appartengono: le notifiche arrivano
    // anche per le schede in secondo piano (una pagina di sotto continua a caricare) e
    // vanno scritte nella scheda giusta, non in quella in vista.

    private WebView buildWebView(final Scheda tab) {
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
        // I popup: senza queste due, window.open e i «accedi con…» non aprono nulla e la
        // pagina resta in attesa di una finestra che non compare.
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // Geolocalizzazione: la WebView la chiede solo se è accesa qui.
        s.setGeolocationEnabled(true);
        if (tab.incognito) s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        applicaUa(tab);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        // Di serie la WebView non manda i cookie di terze parti, e senza di quelli i
        // «accedi con…» e i carrelli si rompono: si accettano per la navigazione normale, e
        // non in incognito, dove il senso è non lasciare traccia.
        cm.setAcceptThirdPartyCookies(v, !tab.incognito);

        v.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView vw, String url, Bitmap f) {
                tab.indirizzo = url == null ? "" : url;
                if (vw == webCorrente()) syncBar(tab.indirizzo);
            }
            @Override public void onPageFinished(WebView vw, String url) {
                tab.indirizzo = url == null ? "" : url;
                if (tab.titolo == null || tab.titolo.isEmpty()) {
                    String t = vw.getTitle();
                    if (t != null && !t.isEmpty()) tab.titolo = t;
                }
                if (vw == webCorrente()) syncBar(tab.indirizzo);
                // La cronologia si scrive a caricamento finito: a pagina iniziata il titolo
                // non c'è ancora, e le voci sarebbero tutte senza nome.
                if (!tab.incognito) addCronologia(url);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView vw, WebResourceRequest req) {
                String u = req.getUrl() != null ? req.getUrl().toString() : "";
                // schemi non http (tel:, mailto:, intent:) -> delega al sistema
                if (!u.startsWith("http://") && !u.startsWith("https://") && !u.startsWith("about:") && !u.startsWith("data:")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception e) {
                        Log.i(TAG, "schema non gestito da nessuna app: " + u, e);
                    }
                    return true;
                }
                return false;
            }
            @Override public void onReceivedError(WebView vw, WebResourceRequest req, WebResourceError err) {
                if (req == null || !req.isForMainFrame()) return;
                Log.w(TAG, "caricamento fallito: " + req.getUrl());
                tab.titolo = "Impossibile caricare la pagina";
                if (vw == webCorrente()) {
                    progress.setVisibility(View.GONE);
                    Toast.makeText(BrowserActivity.this, "Impossibile caricare la pagina", Toast.LENGTH_SHORT).show();
                }
            }
            /**
             * Il processo di disegno delle pagine è morto: la scheda resta, la pagina no.
             *
             * <p>Senza questa risposta la schermata resta bianca e sembra un blocco
             * dell'app, mentre la WebView è già inerte. Si ricarica e si dice cosa è
             * successo — è la stessa scelta che il browser fa sotto Gecko.
             */
            @Override public boolean onRenderProcessGone(WebView vw, android.webkit.RenderProcessGoneDetail dettaglio) {
                Log.e(TAG, "il processo di disegno è andato in crash");
                Toast.makeText(BrowserActivity.this, "La pagina è andata in crash: la ricarico", Toast.LENGTH_SHORT).show();
                int idx = schede.indexOf(tab);
                if (idx >= 0) chiudiScheda(idx);
                return true;   // l'abbiamo gestito noi: la vista morente non va più toccata
            }
        });
        v.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView vw, int p) {
                if (vw != webCorrente()) return;
                if (p < 100) { progress.setVisibility(View.VISIBLE); progress.setProgress(p); }
                else progress.setVisibility(View.GONE);
            }
            @Override public void onReceivedTitle(WebView vw, String title) {
                if (title != null && !title.isEmpty()) tab.titolo = title;
            }
            /** {@code window.open} e i popup: si aprono in una scheda nuova. */
            @Override public boolean onCreateWindow(WebView vw, boolean dialog, boolean gesture, Message resultMsg) {
                Scheda nuova = nuovaScheda(null, tab.incognito, tab.desktop);
                if (resultMsg != null && resultMsg.obj instanceof WebView.WebViewTransport && nuova.web != null) {
                    ((WebView.WebViewTransport) resultMsg.obj).setWebView(nuova.web);
                    resultMsg.sendToTarget();
                    return true;
                }
                return false;
            }
            /** {@code window.close()}: si chiude la scheda che lo ha chiesto. */
            @Override public void onCloseWindow(WebView vw) {
                int idx = schede.indexOf(tab);
                if (idx >= 0) chiudiScheda(idx);
            }

            // ---- le finestrelle della pagina -------------------------------------
            // Sotto WebView funzionano anche da sole, ma mostrerebbero i dialoghi di
            // sistema, diversi da tutto il resto di NovaOS: si disegnano qui, con lo stesso
            // aspetto del browser. Restituire false lascerebbe il dialogo predefinito.
            @Override public boolean onJsAlert(WebView vw, String url, String messaggio, final android.webkit.JsResult esito) {
                new AlertDialog.Builder(BrowserActivity.this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                    .setTitle("La pagina dice")
                    .setMessage(messaggio == null ? "" : messaggio)
                    .setPositiveButton("OK", (d, w) -> esito.confirm())
                    .setOnCancelListener(d -> esito.cancel())
                    .show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView vw, String url, String messaggio, final android.webkit.JsResult esito) {
                new AlertDialog.Builder(BrowserActivity.this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                    .setTitle("La pagina dice")
                    .setMessage(messaggio == null ? "" : messaggio)
                    .setPositiveButton("OK", (d, w) -> esito.confirm())
                    .setNegativeButton("Annulla", (d, w) -> esito.cancel())
                    .setOnCancelListener(d -> esito.cancel())
                    .show();
                return true;
            }
            @Override public boolean onJsPrompt(WebView vw, String url, String messaggio, String predefinito, final android.webkit.JsPromptResult esito) {
                final EditText campo = new EditText(BrowserActivity.this);
                campo.setText(predefinito == null ? "" : predefinito);
                campo.setSelectAllOnFocus(true);
                int pad = dp(18);
                FrameLayout box = new FrameLayout(BrowserActivity.this);
                box.setPadding(pad, pad / 2, pad, 0);
                box.addView(campo);
                new AlertDialog.Builder(BrowserActivity.this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                    .setTitle("La pagina dice")
                    .setMessage(messaggio == null ? "" : messaggio)
                    .setView(box)
                    .setPositiveButton("OK", (d, w) -> esito.confirm(campo.getText().toString()))
                    .setNegativeButton("Annulla", (d, w) -> esito.cancel())
                    .setOnCancelListener(d -> esito.cancel())
                    .show();
                return true;
            }
            /** «Vuoi davvero uscire?» di un modulo compilato: la risposta cauta è «resta». */
            @Override public boolean onJsBeforeUnload(WebView vw, String url, String messaggio, final android.webkit.JsResult esito) {
                new AlertDialog.Builder(BrowserActivity.this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                    .setTitle("Uscire dalla pagina?")
                    .setMessage("I dati inseriti nel modulo potrebbero andare persi.")
                    .setPositiveButton("Esci", (d, w) -> esito.confirm())
                    .setNegativeButton("Resta", (d, w) -> esito.cancel())
                    .setOnCancelListener(d -> esito.cancel())
                    .show();
                return true;
            }

            /** Un allegato da scegliere: si apre la schermata di scelta file di Android. */
            @Override public boolean onShowFileChooser(WebView vw, android.webkit.ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) { fileCallback.onReceiveValue(null); }
                fileCallback = cb;
                Intent intent;
                try { intent = params.createIntent(); }
                catch (Exception e) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType("*/*"); intent.addCategory(Intent.CATEGORY_OPENABLE);
                }
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(intent, "Seleziona"), RICHIESTA_FILE); }
                catch (Exception e) {
                    Log.w(TAG, "nessuna app per scegliere un file", e);
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            /**
             * La pagina chiede la fotocamera o il microfono ({@code getUserMedia}).
             *
             * <p>La regola è: prima Android, poi la pagina. Concedere alla pagina un
             * permesso che Android non ha dato significa una fotocamera che non inquadra —
             * cioè di nuovo un guasto che non somiglia a un guasto.
             */
            @Override public void onPermissionRequest(final PermissionRequest richiesta) {
                final String[] risorse = richiesta.getResources();
                boolean vuoleVideo = false, vuoleAudio = false;
                for (String r : risorse) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) vuoleVideo = true;
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) vuoleAudio = true;
                }
                ArrayList<String> concesse = new ArrayList<>();
                if (vuoleVideo && checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
                    concesse.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                if (vuoleAudio && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                    concesse.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                if (!concesse.isEmpty()) { richiesta.grant(concesse.toArray(new String[0])); return; }

                final ArrayList<String> mancanti = new ArrayList<>();
                if (vuoleVideo && checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                    mancanti.add(android.Manifest.permission.CAMERA);
                if (vuoleAudio && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                    mancanti.add(android.Manifest.permission.RECORD_AUDIO);
                if (mancanti.isEmpty()) { richiesta.deny(); return; }

                if (mediaInAttesa != null) {
                    // Una sola richiesta media per volta: rispondere più tardi a una pagina
                    // che nel frattempo ha rinunciato non serve a nessuno. Meglio un «no».
                    richiesta.deny();
                    return;
                }
                mediaInAttesa = richiesta;
                mediaVuoleVideo = vuoleVideo;
                mediaVuoleAudio = vuoleAudio;
                unPermessoAllaVolta(() -> requestPermissions(mancanti.toArray(new String[0]), RICHIESTA_MEDIA));
            }

            /** La pagina chiede di sapere dove sei: si chiede la posizione ad Android. */
            @Override public void onGeolocationPermissionsShowPrompt(String origine, final GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origine, true, false);
                    return;
                }
                posizioneInAttesa = cb;
                origineInAttesa = origine;
                unPermessoAllaVolta(() -> requestPermissions(new String[]{
                        android.Manifest.permission.ACCESS_FINE_LOCATION,
                        android.Manifest.permission.ACCESS_COARSE_LOCATION }, RICHIESTA_POSIZIONE));
            }

            @Override public void onGeolocationPermissionsHidePrompt() {
                if (posizioneInAttesa != null) {
                    posizioneInAttesa.invoke(origineInAttesa, false, false);
                    posizioneInAttesa = null;
                }
            }
        });

        // download reali (PDF, immagini, file): usa il DownloadManager di sistema.
        // Il limite è che qui arriva un indirizzo e non lo stream: il file lo scarica il
        // sistema, senza i cookie della pagina, quindi un PDF dietro login non si scarica.
        v.setDownloadListener((url, ua, disp, mime, len) -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setMimeType(mime);
                r.addRequestHeader("User-Agent", ua);
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String name = URLUtil.guessFileName(url, disp, mime);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(r);
                Toast.makeText(BrowserActivity.this, "Download avviato: " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Log.e(TAG, "download non riuscito", e);
                Toast.makeText(BrowserActivity.this, "Download non riuscito", Toast.LENGTH_SHORT).show();
            }
        });

        // Nessun setFindListener: la WebView ne ha uno, ma non è utilizzabile — v.
        // contaOccorrenze(), che il conteggio lo chiede alla pagina.
        return v;
    }

    private WebView webCorrente() { Scheda s = schedaCorrente(); return s == null ? null : s.web; }

    // ------------------------------------------------------------------ permessi (una alla volta)
    private static final int RICHIESTA_MEDIA = 4811;
    private static final int RICHIESTA_POSIZIONE = 4812;
    private static final int RICHIESTA_FILE = 4801;

    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private PermissionRequest mediaInAttesa;
    private boolean mediaVuoleVideo, mediaVuoleAudio;
    private GeolocationPermissions.Callback posizioneInAttesa;
    private String origineInAttesa;

    /**
     * Una richiesta di permesso per volta.
     *
     * <p>Android accetta un solo dialogo di permessi alla volta, e la seconda richiesta
     * aperta mentre la prima è in corso viene <b>rifiutata all'istante</b> — un rifiuto
     * tecnico indistinguibile da un «no» dell'utente. Il caso non è teorico: una pagina che
     * chiama {@code getUserMedia({audio:true, video:true})} fa passare di qui due permessi
     * insieme, e basta un secondo tocco perché la coda diventi necessaria.
     */
    private boolean permessiInCorso = false;
    private final ArrayDeque<Runnable> permessiInCoda = new ArrayDeque<>();

    private void unPermessoAllaVolta(Runnable richiesta) {
        if (permessiInCorso) { permessiInCoda.add(richiesta); return; }
        permessiInCorso = true;
        richiesta.run();
    }

    private void turnoSuccessivoDeiPermessi() {
        Runnable prossima = permessiInCoda.poll();
        if (prossima == null) { permessiInCorso = false; return; }
        prossima.run();
    }

    @Override public void onRequestPermissionsResult(int codice, String[] permessi, int[] esiti) {
        super.onRequestPermissionsResult(codice, permessi, esiti);
        boolean tutti = esiti.length > 0;
        for (int e : esiti) if (e != PackageManager.PERMISSION_GRANTED) tutti = false;
        if (codice == RICHIESTA_MEDIA) {
            PermissionRequest richiesta = mediaInAttesa;
            boolean video = mediaVuoleVideo, audio = mediaVuoleAudio;
            mediaInAttesa = null;
            if (richiesta != null) {
                ArrayList<String> concesse = new ArrayList<>();
                if (video && tutti) concesse.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                if (audio && tutti) concesse.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                if (concesse.isEmpty()) richiesta.deny();
                else richiesta.grant(concesse.toArray(new String[0]));
            }
        } else if (codice == RICHIESTA_POSIZIONE) {
            GeolocationPermissions.Callback cb = posizioneInAttesa;
            String origine = origineInAttesa;
            posizioneInAttesa = null;
            if (cb != null) cb.invoke(origine, tutti, false);
        }
        turnoSuccessivoDeiPermessi();
    }

    @Override protected void onActivityResult(int codice, int esito, Intent dati) {
        super.onActivityResult(codice, esito, dati);
        if (codice != RICHIESTA_FILE) return;
        android.webkit.ValueCallback<Uri[]> cb = fileCallback;
        fileCallback = null;
        if (cb == null) return;
        cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(esito, dati));
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
            public void onTextChanged(CharSequence s, int a, int b, int c) { cerca(s.toString()); }
            public void afterTextChanged(Editable s) {}
        });
        findInfo = new TextView(this);
        findInfo.setTextColor(DIM);
        findInfo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        findInfo.setPadding(dp(6), 0, dp(6), 0);
        Button prev = iconBtn("↑"); prev.setOnClickListener(v -> salta(false));
        Button next = iconBtn("↓"); next.setOnClickListener(v -> salta(true));
        Button x = iconBtn("✕"); x.setOnClickListener(v -> mostraBarraTrova(false));
        // La barra «trova» sta sotto quella superiore e ne segue i colori: in incognito
        // deve essere scura come lei, altrimenti è una striscia chiara in mezzo al viola.
        testiTema.add(prev); testiTema.add(next); testiTema.add(x);
        f.addView(findInput); f.addView(findInfo); f.addView(prev); f.addView(next); f.addView(x);
        return f;
    }

    /**
     * Cerca e mette in evidenza tutte le occorrenze, e ne fa contare quante sono.
     *
     * <p>L'evidenziazione e il salto sono della WebView, e funzionano: si vedono le
     * occorrenze accendersi e il salto che le percorre. Il <b>numero</b> invece no — e non
     * è una svista, è stato misurato. Con due occorrenze in pagina, il {@code FindListener}
     * di questa piattaforma annuncia un totale che va da 0 a 1 a seconda di quale tasto si
     * preme, e una posizione ferma a 2 in entrambe le direzioni: un contatore preso da lì
     * scriverebbe «0/0» o «3/1» sopra una pagina con due parole evidenziate, cioè una
     * bugia. Il numero lo conta quindi la pagina stessa, sul proprio testo visibile.
     *
     * <p>Ne esce un totale e non una posizione («2», non «1/2»): quale occorrenza si stia
     * guardando è una cosa che il salto della WebView non annuncia in modo affidabile, e
     * un «quale» inventato sarebbe peggio di un totale vero.
     */
    private void cerca(String testo) {
        Scheda t = schedaCorrente();
        if (t == null || t.web == null) return;
        if (testo == null || testo.isEmpty()) { t.web.clearMatches(); findInfo.setText(""); return; }
        t.web.findAllAsync(testo);
        contaOccorrenze(t.web, testo);
    }

    /** Fa contare alla pagina le occorrenze del testo nel suo testo visibile. */
    private void contaOccorrenze(WebView w, String testo) {
        String js = "(function(){try{"
                + "var q=" + JSONObject.quote(testo) + ";"
                + "var t=document.body?document.body.innerText:'';"
                + "var re=new RegExp(q.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'gi');"
                + "var m=t.match(re);return m?m.length:0;"
                + "}catch(e){return -1;}})()";
        w.evaluateJavascript(js, r -> {
            if (r == null) { findInfo.setText(""); return; }
            r = r.trim();
            if (r.length() > 1 && r.charAt(0) == '"') r = r.substring(1, r.length() - 1);
            findInfo.setText("-1".equals(r) ? "" : r);
        });
    }

    /**
     * Passa all'occorrenza successiva o precedente.
     *
     * <p>Sta separata da {@link #cerca} per una ragione precisa: chiamando {@code findNext}
     * subito dopo {@code findAllAsync} — cioè a ogni lettera digitata — la WebView annuncia
     * una posizione che non ha niente a che vedere con la ricerca appena fatta, e il
     * contatore arriva a dire cose come «3/1»: tre di una. La posizione la sa solo la
     * ricerca in corso, e il salto lo decide il dito.
     */
    private void salta(boolean avanti) {
        Scheda t = schedaCorrente();
        if (t == null || t.web == null) return;
        if (findInput.getText().toString().isEmpty()) return;
        t.web.findNext(avanti);
    }

    private void mostraBarraTrova(boolean mostra) {
        findBar.setVisibility(mostra ? View.VISIBLE : View.GONE);
        if (mostra) { findInput.requestFocus(); }
        else {
            Scheda t = schedaCorrente();
            if (t != null && t.web != null) t.web.clearMatches();
            findInput.setText(""); findInfo.setText(""); hideKeyboard();
        }
    }

    // ------------------------------------------------------------------ preferiti / cronologia
    // Un elenco solo, condiviso con la shell.
    //
    // Il browser nativo e l'app Browser dentro la shell avevano due elenchi indipendenti:
    // un preferito salvato in uno non si vedeva nell'altro. Qui si usa la stessa copia che
    // la shell aggiorna a ogni modifica — le preferenze native «novaos», chiavi
    // nova:bookmarks e nova:browserHistory — e le stesse forme delle voci che scrive la
    // shell: {name, url} per i preferiti, {url, t} per la cronologia (dalla più recente).
    // Così un preferito salvato nella shell si vede qui senza alcun lavoro in più.
    //
    // Il verso opposto — uno salvato qui che compare nella shell — ha bisogno che la shell
    // riceva la notizia, perché legge la propria localStorage: se ne occupa
    // MainActivity.preferitiCambiati(), chiamata a ogni modifica di questo elenco.

    private SharedPreferences prefs() { return getSharedPreferences("novaos", MODE_PRIVATE); }

    private JSONArray arr(String k) {
        try { return new JSONArray(prefs().getString("nova:" + k, "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    private void putArr(String k, JSONArray a) { prefs().edit().putString("nova:" + k, a.toString()).apply(); }

    /** Il nome di un preferito: la shell scrive «name», le versioni precedenti «title». */
    private static String nomePreferito(JSONObject o) {
        String n = o.optString("name", "");
        if (n.isEmpty()) n = o.optString("title", "");
        if (n.isEmpty()) n = o.optString("url");
        return n;
    }

    private void addPreferito(String titolo, String url) {
        if (url == null || url.isEmpty()) return;
        try {
            JSONArray a = arr("bookmarks");
            for (int i = 0; i < a.length(); i++) if (url.equals(a.getJSONObject(i).optString("url"))) {
                Toast.makeText(this, "Già nei preferiti", Toast.LENGTH_SHORT).show(); return;
            }
            JSONObject o = new JSONObject();
            o.put("name", titolo == null || titolo.isEmpty() ? url : titolo);
            o.put("url", url);
            a.put(o); putArr("bookmarks", a);
            Toast.makeText(this, "Aggiunto ai preferiti", Toast.LENGTH_SHORT).show();
            MainActivity.preferitiCambiati();
        } catch (Exception e) { Log.w(TAG, "preferito non salvato", e); }
    }

    private void addCronologia(String url) {
        if (url == null || url.isEmpty() || url.startsWith("data:")) return;
        try {
            JSONArray a = arr("browserHistory");
            JSONArray out = new JSONArray();
            JSONObject o = new JSONObject();
            o.put("url", url); o.put("t", System.currentTimeMillis());
            out.put(o);
            // 30 voci, come la shell: è la sua stessa coda, e allungarla qui vorrebbe dire
            // che il primo caricamento della shell la accorcia di nuovo.
            for (int i = 0; i < a.length() && out.length() < 30; i++) {
                JSONObject e = a.getJSONObject(i);
                if (!url.equals(e.optString("url"))) out.put(e);
            }
            putArr("browserHistory", out);
        } catch (Exception e) { Log.w(TAG, "cronologia non aggiornata", e); }
    }

    private boolean eNeiPreferiti(String url) {
        if (url == null || url.isEmpty()) return false;
        JSONArray a = arr("bookmarks");
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && url.equals(o.optString("url"))) return true;
        }
        return false;
    }

    /** Aggiunge o rimuove il preferito (toggle) e mostra un avviso. */
    private void invertiPreferito(String titolo, String url) {
        if (url == null || url.isEmpty()) return;
        if (eNeiPreferiti(url)) { rimuoviPreferito(url); Toast.makeText(this, "Rimosso dai preferiti", Toast.LENGTH_SHORT).show(); }
        else addPreferito(titolo, url);
        // La stella del menu si ridisegna qui, non alla riapertura del menu: il pannello
        // resta aperto dopo il tocco, ed è la stella a dire se il salvataggio è avvenuto.
        aggiornaStellaUI();
    }

    /** Il tocco sulla stella (della fila in alto o della voce): agisce sulla scheda in vista. */
    private void invertiPreferitoDaMenu(View v) {
        Scheda c = schedaCorrente();
        if (c == null || c.indirizzo == null || c.indirizzo.isEmpty()) return;
        invertiPreferito(c.titolo, c.indirizzo);
    }

    /**
     * Ridisegna le stelle dei preferiti secondo lo stato <b>vero</b> della pagina.
     *
     * <p>Blu quando la pagina è salvata — è il segno che il salvataggio è avvenuto — e del
     * colore del testo quando non lo è. Prima la stella della fila restava com'era al
     * momento dell'apertura del menu: il salvataggio si vedeva solo chiudendo e riaprendo.
     * I riferimenti sono nulli quando il menu è chiuso, e in quel caso non c'è nulla da
     * ridisegnare.
     */
    private void aggiornaStellaUI() {
        Scheda s = schedaCorrente();
        boolean bm = s != null && eNeiPreferiti(s.indirizzo);
        int su = bm ? ACC : (s != null && s.incognito ? INC_TXT : TXT);
        if (stellaFila != null) { stellaFila.setText(bm ? "★" : "☆"); stellaFila.setTextColor(su); }
        if (stellaVoceIcona != null) { stellaVoceIcona.setText(bm ? "★" : "☆"); stellaVoceIcona.setTextColor(su); }
        if (stellaVoceTesto != null) stellaVoceTesto.setText(bm ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti");
    }

    private void rimuoviPreferito(String url) {
        try {
            JSONArray a = arr("bookmarks"), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (!url.equals(o.optString("url"))) out.put(o);
            }
            putArr("bookmarks", out);
            MainActivity.preferitiCambiati();
        } catch (Exception e) { Log.w(TAG, "preferito non rimosso", e); }
    }

    private void rimuoviPreferitoIndice(int idx) {
        try {
            JSONArray a = arr("bookmarks"), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) if (i != idx) out.put(a.get(i));
            putArr("bookmarks", out);
            MainActivity.preferitiCambiati();
        } catch (Exception e) { Log.w(TAG, "preferito non rimosso", e); }
    }

    /** Elenco preferiti: tocca una voce per aprire/rinominare/eliminare. */
    private void mostraPreferiti() {
        JSONArray a = arr("bookmarks");
        int n = a.length();
        if (n == 0) {
            new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle("Preferiti")
                .setMessage("Nessun preferito.\nApri un sito e usa «Aggiungi ai preferiti» dal menu.")
                .setNegativeButton("Chiudi", null).show();
            return;
        }
        final String[] labels = new String[n];
        for (int i = 0; i < n; i++) {
            JSONObject o = a.optJSONObject(i);
            labels[i] = "★  " + (o != null ? nomePreferito(o) : "");
        }
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle("Preferiti (" + n + ")")
            .setItems(labels, (d, w) -> azioniPreferito(w))
            .setNegativeButton("Chiudi", null).show();
    }

    private void azioniPreferito(int idx) {
        JSONArray a = arr("bookmarks");
        JSONObject o = a.optJSONObject(idx); if (o == null) return;
        final String titolo = nomePreferito(o);
        final String url = o.optString("url");
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle(titolo)
            .setItems(new String[]{ "Apri", "Apri in nuova scheda", "Rinomina", "Elimina" }, (d, w) -> {
                switch (w) {
                    case 0: Scheda s = schedaCorrente(); if (s != null && s.web != null) s.web.loadUrl(url); break;
                    case 1: nuovaScheda(url, false, false); break;
                    case 2: rinominaPreferito(idx); break;
                    case 3: rimuoviPreferitoIndice(idx); Toast.makeText(this, "Preferito eliminato", Toast.LENGTH_SHORT).show(); break;
                }
            })
            .setNegativeButton("Annulla", null).show();
    }

    private void rinominaPreferito(int idx) {
        JSONArray a = arr("bookmarks"); JSONObject o = a.optJSONObject(idx); if (o == null) return;
        final EditText in = new EditText(this);
        in.setText(nomePreferito(o));
        in.setSelectAllOnFocus(true);
        int pad = dp(18);
        FrameLayout box = new FrameLayout(this); box.setPadding(pad, pad / 2, pad, 0); box.addView(in);
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle("Rinomina preferito").setView(box)
            .setPositiveButton("Salva", (d, w) -> {
                try {
                    JSONArray b = arr("bookmarks"); JSONObject bo = b.optJSONObject(idx);
                    if (bo != null) {
                        String t = in.getText().toString().trim();
                        bo.put("name", t.isEmpty() ? bo.optString("url") : t);
                        putArr("bookmarks", b);
                        MainActivity.preferitiCambiati();
                    }
                } catch (Exception e) { Log.w(TAG, "rinomina non salvata", e); }
            })
            .setNegativeButton("Annulla", null).show();
    }

    private void mostraCronologia() {
        JSONArray a = arr("browserHistory");
        int n = a.length();
        final String[] labels = new String[n];
        final String[] urls = new String[n];
        for (int i = 0; i < n; i++) {
            JSONObject o = a.optJSONObject(i);
            urls[i] = o != null ? o.optString("url") : "";
            // La shell non salvava il titolo, solo l'indirizzo: si mostra quello.
            labels[i] = urls[i];
        }
        AlertDialog.Builder bld = new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK).setTitle("Cronologia");
        if (n == 0) bld.setMessage("Nessuna cronologia.");
        else bld.setItems(labels, (d, w) -> {
            Scheda s = schedaCorrente();
            if (s != null && s.web != null) s.web.loadUrl(urls[w]);
        });
        if (n > 0) bld.setNeutralButton("Cancella", (d, w) -> putArr("browserHistory", new JSONArray()));
        bld.setNegativeButton("Chiudi", null).show();
    }

    // ------------------------------------------------------------------ pagina iniziale
    /**
     * La chiave della pagina iniziale, condivisa con la shell.
     *
     * <p>Sta nella stessa copia dei preferiti e del tema: la si cambia da qui e, se un
     * giorno la shell esporrà la voce nelle sue Impostazioni, la si cambia da lì, e resta
     * un valore solo. Il formato è la stringa JSON con cui la shell salva ogni preferenza.
     */
    private static final String PREF_HOME = "nova:browserHome";

    /**
     * Dove porta la casa: la pagina scelta dall'utente, o quella di serie.
     *
     * <p>Accetta sia un valore JSON ({@code "https://…"}) sia una stringa nuda, e uno
     * scritto senza schema ({@code wikipedia.org}) viene completato con {@code https://}:
     * la preferenza è leggibile e scrivibile anche a mano, e un valore scritto male deve
     * portare a una pagina, non a una ricerca.
     */
    private String paginaIniziale() {
        String v = prefs().getString(PREF_HOME, "");
        if (v == null) v = "";
        v = v.trim();
        if (v.length() >= 2 && v.charAt(0) == '"' && v.endsWith("\"")) {
            try { v = new JSONTokener(v).nextValue().toString().trim(); } catch (Exception e) { /* resta com'è */ }
        }
        if (v.isEmpty()) return HOME_PREDEFINITA;
        return v.matches("^[a-zA-Z][a-zA-Z0-9+.-]*:.*") ? v : "https://" + v;
    }

    private void vaiAllaHome() {
        Scheda s = schedaCorrente();
        String u = paginaIniziale();
        if (s == null || s.web == null) nuovaScheda(u, false, false);
        else s.web.loadUrl(u);
    }

    /**
     * Salva la pagina che si sta guardando come pagina iniziale.
     *
     * <p>Una pagina vuota non è una scelta: {@code about:blank} non è mai ciò che si vuole
     * trovarsi aprendo il browser, quindi la voce lo rifiuta invece di accettarlo e
     * lasciare una casa che non porta da nessuna parte.
     */
    private void impostaPaginaIniziale() {
        Scheda s = schedaCorrente();
        String u = s == null ? null : s.indirizzo;
        if (u == null || u.isEmpty() || u.startsWith("about:")) {
            Toast.makeText(this, "Apri prima una pagina da usare come pagina iniziale", Toast.LENGTH_SHORT).show();
            return;
        }
        prefs().edit().putString(PREF_HOME, JSONObject.quote(u)).apply();
        Toast.makeText(this, "Pagina iniziale impostata", Toast.LENGTH_SHORT).show();
    }

    // ------------------------------------------------------------------ condividi / sistema
    private void condividi(String url) {
        if (url == null || url.isEmpty()) return;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, url);
        startActivity(Intent.createChooser(i, "Condividi"));
    }
    private void apriNelBrowserDiSistema(String url) {
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
    private LinearLayout radice() {
        try { return (LinearLayout) ((ViewGroup) findViewById(android.R.id.content)).getChildAt(0); }
        catch (Exception e) { return null; }
    }

    /** Un pulsante della barra scritto con un carattere: frecce, stella, croce, più. */
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

    /**
     * Un'icona <b>disegnata</b>, di lato {@code lato} dp e del colore dato.
     *
     * <p>Il colore si dà qui e non nel file XML: lo stesso disegno serve la barra chiara e
     * quella scura, e il tema lo conosce solo la schermata — così c'è un disegno per icona
     * invece di uno per icona e per tema.
     */
    private ImageView iconaVista(int icona, int lato, int colore) {
        ImageView v = new ImageView(this);
        v.setImageResource(icona);
        v.setColorFilter(colore, PorterDuff.Mode.SRC_IN);
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(lato), dp(lato)));
        return v;
    }

    /**
     * Un pulsante-icona della barra: la sola immagine, senza testo.
     *
     * <p>L'area di tocco resta 40 dp anche se il disegno ne occupa 24: è la misura sotto la
     * quale un dito comincia a sbagliare bersaglio, e il cerchio che si accende al tocco
     * deve starci dentro.
     */
    private ImageView iconaBtn(int icona) {
        ImageView v = iconaVista(icona, 40, TXT);
        v.setScaleType(ImageView.ScaleType.CENTER);
        // Cerchio che si accende al tocco, disegnato a mano invece di prendere
        // ?selectableItemBackgroundBorderless: quello porta con sé anche lo stato
        // «ha il fuoco», cioè un rettangolo verde che compare attorno all'icona appena
        // l'omnibox perde il fuoco — il fuoco va alla prima vista che lo accetta, che
        // nella barra è la casa. Lo stato che serve è uno solo: il dito che preme.
        GradientDrawable cerchio = new GradientDrawable();
        cerchio.setShape(GradientDrawable.OVAL);
        cerchio.setColor(Color.WHITE);
        v.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33808080), null, cerchio));
        // E nemmeno il fuoco da tastiera: appena l'omnibox lo perde (naviga() lo lascia
        // andare) il fuoco va alla prima vista che lo accetta, e il cerchio resterebbe
        // acceso attorno alla casa come se fosse premuta. Sul telefono il fuoco da
        // tastiera non serve a nulla; l'area di tocco è la stessa cosa.
        v.setFocusable(false);
        return v;
    }

    private GradientDrawable squareBadge() { return squareBadge(DIM); }

    private GradientDrawable squareBadge(int colore) {
        GradientDrawable g = new GradientDrawable();
        g.setStroke(dp(2), colore); g.setCornerRadius(dp(5)); g.setColor(Color.TRANSPARENT);
        return g;
    }
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }
    private void hideKeyboard() {
        try { InputMethodManager im = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            im.hideSoftInputFromWindow(omnibox.getWindowToken(), 0); } catch (Exception e) {}
    }

    @Override public boolean onKeyDown(int codice, KeyEvent evento) {
        // Tasto indietro fisico: stessa scala di precedenze di onBackPressed.
        if (codice == KeyEvent.KEYCODE_BACK) { onBackPressed(); return true; }
        return super.onKeyDown(codice, evento);
    }

    @Override public void onBackPressed() {
        if (menuAperto != null) { chiudiMenu(); return; }
        if (selettore != null) { chiudiSelettore(); return; }
        if (fullscreen) { setSchermoIntero(false); return; }
        if (findBar.getVisibility() == View.VISIBLE) { mostraBarraTrova(false); return; }
        Scheda s = schedaCorrente();
        if (s != null && s.web != null && s.web.canGoBack()) s.web.goBack();
        else if (schede.size() > 1) chiudiScheda(corrente);
        else super.onBackPressed();
    }

    /**
     * La chiusura del browser.
     *
     * <p>Le WebView si distruggono qui e non si lasciano al sistema: una WebView
     * dimenticata resta viva con la sua pagina, e in incognito con la sua cronologia.
     */
    @Override protected void onDestroy() {
        chiudiMenu();
        for (Scheda t : schede) {
            try { t.web.destroy(); } catch (Exception e) { /* già distrutta */ }
        }
        schede.clear();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ schermo intero
    private boolean fullscreen = false;
    private ImageView fsRestore;   // pulsante flottante per tornare alla vista normale

    private void setSchermoIntero(boolean on) {
        fullscreen = on;
        bar.setVisibility(on ? View.GONE : View.VISIBLE);
        progress.setVisibility(View.GONE);
        View decor = getWindow().getDecorView();
        if (on) {
            decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            addRestoreButton();
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            if (fsRestore != null && fsRestore.getParent() != null) ((ViewGroup) fsRestore.getParent()).removeView(fsRestore);
            fsRestore = null;
        }
    }

    /**
     * Il pulsante flottante in basso a destra per uscire dallo schermo intero.
     *
     * <p>Il disegno è bianco su un cerchio nero semitrasparente, e i colori sono fissi —
     * non quelli del tema. Il pulsante sta sopra la pagina, di cui non si sa nulla: qualunque
     * colore preso dal tema può finire su una pagina dello stesso colore, mentre il nero
     * semitrasparente col disegno bianco dentro si vede su qualunque sfondo. Con il colore
     * del testo del tema chiaro (quasi nero) su questo cerchio il segno spariva.
     */
    private void addRestoreButton() {
        if (fsRestore != null) return;
        fsRestore = new ImageView(this);
        fsRestore.setImageResource(R.drawable.ic_fullscreen_exit);
        fsRestore.setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN);
        fsRestore.setScaleType(ImageView.ScaleType.CENTER);
        fsRestore.setContentDescription("Esci dallo schermo intero");
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xCC000000);
        fsRestore.setBackground(bg);
        fsRestore.setClickable(true);
        fsRestore.setOnClickListener(v -> setSchermoIntero(false));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(48), dp(48));
        lp.gravity = Gravity.BOTTOM | Gravity.END;
        lp.rightMargin = dp(14); lp.bottomMargin = dp(20);
        ((ViewGroup) findViewById(android.R.id.content)).addView(fsRestore, lp);
    }
}
