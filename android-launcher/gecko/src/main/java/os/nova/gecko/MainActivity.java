package os.nova.gecko;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;

import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.gecko.util.GeckoBundle;

import java.util.List;
import java.util.Map;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Spike della migrazione a GeckoView: carica la shell NovaOS dentro una GeckoSession,
 * le dà un ponte verso il nativo e verifica che si comporti come sotto WebView.
 *
 * <p>Origini possibili, scelte dall'extra di intent {@code "origin"}:
 * <ul>
 *   <li>{@code local} (la forma di destinazione) &rarr; {@code http://127.0.0.1:8731/…},
 *       servita da {@link ShellServer}. È l'unica origine che regge il ponte <i>e</i>
 *       che sopravvive alla ROM, dove non esiste alcun computer di sviluppo.</li>
 *   <li>{@code http} &rarr; il server di sviluppo sul computer
 *       ({@code http://10.0.2.2:8091}), comodo per iterare sulla shell senza reinstallare.</li>
 *   <li>{@code asset} (predefinita) &rarr; {@code resource://android/assets/www/index.html}:
 *       la shell gira, ma senza ponte — serve come riferimento di fase 0.</li>
 *   <li>{@code internal} &rarr; {@code file://…/files/shell/index.html}: idem, e la shell
 *       <b>non</b> è agganciabile dal content script (v. sotto).</li>
 *   <li>{@code extension} &rarr; {@code moz-extension://…/www/index.html}: via abbandonata,
 *       tenuta per memoria (v. {@link #ORIGIN_EXTENSION}).</li>
 * </ul>
 *
 * <p><b>Il vincolo che ha dettato il progetto</b> (2026-09-18): il ponte richiede un
 * content script, e Gecko accetta di iniettarlo solo su origini {@code http(s)://}.
 * Non su {@code file://} (il permesso sui file è spento anche per le estensioni
 * integrate) e non su {@code moz-extension://} (che non è un ambiente privilegiato).
 * Da qui la scelta del server locale. Il percorso completo è in
 * {@code docs/MIGRAZIONE-GECKOVIEW.md §10}.
 */
public class MainActivity extends Activity {

    private static final String TAG = "NovaGeckoSpike";

    public static final String ORIGIN_ASSET = "asset";
    public static final String ORIGIN_INTERNAL = "internal";
    /** La shell servita <b>dall'interno dell'estensione</b>
     *  ({@code moz-extension://…/www/index.html}).
     *
     *  <p>Via abbandonata, conservata come voce dell'elenco perché sia chiaro che è
     *  stata provata: la pagina carica e l'adattatore si installa, ma
     *  {@code sendNativeMessage} da lì <b>non arriva</b> al nativo — la promessa non si
     *  risolve né si rifiuta. Una pagina servita da {@code moz-extension://} non è un
     *  ambiente privilegiato. Vedi {@code docs/MIGRAZIONE-GECKOVIEW.md §10.3}. */
    public static final String ORIGIN_EXTENSION = "extension";
    /** La shell servita da un server HTTP locale.
     *
     *  <p>È l'origine che il ponte può davvero usare. Le due vie precedenti sono
     *  entrambe chiuse, e per ragioni diverse (verificate il 2026-09-18):
     *  <ul>
     *    <li>{@code file://} — da Firefox 153 l'accesso ai file è un permesso a sé,
     *        spento anche per le estensioni integrate: il content script non si inietta;</li>
     *    <li>{@code moz-extension://} — la pagina carica e gira, ma non è un ambiente
     *        privilegiato: {@code sendNativeMessage} esiste e non arriva a destinazione
     *        (la promessa non si risolve né si rifiuta).</li>
     *  </ul>
     *  Un'origine {@code http://} locale non ha né l'uno né l'altro problema: non è
     *  una pagina di estensione (quindi nessuna CSP d'estensione) e non è un file
     *  (quindi il content script si inietta). È anche l'unica che sopravvive al
     *  passaggio a ROM, dove {@code 10.0.2.2} diventa {@code 127.0.0.1}. */
    public static final String ORIGIN_HTTP = "http";
    /** Server di sviluppo sul computer: dall'emulatore è {@code 10.0.2.2}. */
    private static final String DEV_URL = "http://10.0.2.2:8091/index.html";
    /** La forma definitiva: la shell servita da un server HTTP <b>dentro l'app</b>,
     *  in ascolto solo su {@code 127.0.0.1}. È l'origine che il ponte può usare e che
     *  resta valida anche sulla ROM, dove non esiste alcun computer di sviluppo. */
    public static final String ORIGIN_LOCAL = "local";

    private ShellServer server;

    /** La porta nativa: l'unico canale con cui il nativo può parlare per primo
     *  alla shell. Arriva da {@link WebExtension.MessageDelegate#onConnect} e resta
     *  aperta finché l'estensione non la chiude. Vedi {@link #rispondiAllaPagina}. */
    private WebExtension.Port portaNativa;

    private static final String ASSET_SHELL = "www";      // src/main/assets/www
    private static final String ASSET_INDEX = "resource://android/assets/www/index.html";

    private GeckoRuntime runtime;
    private GeckoSession session;
    private GeckoView view;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String origin = getIntent().getStringExtra("origin");
        if (origin == null) origin = ORIGIN_ASSET;

        // Diagnostica: la console della pagina finisce in logcat (tag "GeckoConsole"),
        // così si vede subito se la shell fallisce all'avvio e perché.
        //
        // NOTA: GeckoView 155 NON ha più ContentDelegate.onConsoleMessage — quella API
        // è stata rimossa (verificato con javap sull'AAR: nessuna classe Console* e
        // l'interfaccia non ha più il metodo). Un'altra differenza rispetto alla WebView
        // da mettere a piano: i ponti JS↔nativo passano ormai dalle WebExtension.
        GeckoRuntimeSettings settings = new GeckoRuntimeSettings.Builder()
                .consoleOutput(true)
                .build();
        runtime = GeckoRuntime.create(this, settings);

        session = new GeckoSession();
        session.open(runtime);

        view = new GeckoView(this);
        view.setSession(session);
        setContentView(view);

        String uri;
        if (ORIGIN_INTERNAL.equals(origin)) uri = copyShellToInternalAndGetUrl();
        else if (ORIGIN_HTTP.equals(origin)) uri = DEV_URL;
        else if (ORIGIN_EXTENSION.equals(origin)) uri = null;   // dipende dall'id dell'estensione
        else if (ORIGIN_LOCAL.equals(origin)) uri = avviaServerLocale();
        else uri = ASSET_INDEX;

        Log.i(TAG, "origine=" + origin + " uri=" + uri);
        installaPonteECarica(uri);

        immersive();
    }

    /**
     * Fase 2 — installa l'estensione che regge il ponte, poi carica la shell.
     *
     * <p>L'estensione sta negli assets dell'app e Gecko la carica con lo schema
     * {@code resource://android/assets/…}. Quello schema è la <i>provenienza
     * dell'estensione</i>, non la pagina che essa aggancia: il content script aggancia
     * {@code http://127.0.0.1/…}, cioè la shell servita dal server locale.
     *
     * <p><b>L'ordine non è un dettaglio</b> (verificato il 2026-09-18): {@code installBuiltIn}
     * è asincrona. Caricando la pagina subito dopo la chiamata — senza attendere l'esito —
     * il content script dichiarato a {@code document_start} arriva a documento già iniziato
     * e <b>non viene mai iniettato</b>: l'estensione risulta installata, abilitata e con le
     * origini concesse, ma la pagina non vede {@code window.NovaNative} e la shell ripiega
     * in simulazione. È il guasto che si presentava come «il dock apre il browser vecchio
     * invece del browser nativo»: senza ponte, {@code NB().cmd("openBrowser")} è falso e la
     * shell usa la sua anteprima interna. Quindi: si carica la shell <i>dentro</i> il
     * callback di installazione.
     */
    private void installaPonteECarica(String uri) {
        runtime.getWebExtensionController()
                .installBuiltIn("resource://android/assets/extension/")
                .accept(
                        ext -> {
                            ext.setMessageDelegate(new BridgeMessages(), "browser");
                            // Diagnostica: se il content script non arriva, la prima cosa da
                            // escludere è che l'estensione sia installata ma disabilitata
                            // (o che le siano state negate le origini richieste).
                            WebExtension.MetaData md = ext.metaData;
                            Log.i(TAG, "estensione del ponte pronta: " + ext.id
                                    + " enabled=" + md.enabled
                                    + " disabledFlags=" + md.disabledFlags);
                            carica(uri);
                        },
                        e -> {
                            // Ponte assente: la shell resta usabile in simulazione, come
                            // nello spike di fase 0. Non è un motivo per non caricarla.
                            Log.e(TAG, "estensione del ponte NON installata: si prosegue senza", e);
                            carica(uri);
                        });
    }

    // Qui esisteva `concediAccessoAiFile`, che concedeva all'estensione il permesso
    // opzionale `file:///*` sperando di sbloccare l'iniezione sulla shell servita da
    // file://. È stata rimossa perché **non funziona**: `addOptionalPermissions`
    // concede l'origine (il registro dice `grantedOptionalOrigins=[file:///*]`) ma
    // NON sblocca l'iniezione. Da Firefox 153 l'accesso ai file è una classe di
    // permesso a sé, spenta anche per le estensioni integrate e priva di equivalente
    // programmatico in GeckoView. Vedi docs/MIGRAZIONE-GECKOVIEW.md §10.1.

    private void carica(String uri) {
        runOnUiThread(() -> {
            if (session == null) return;      // Activity già chiusa nel frattempo
            Log.i(TAG, "carico la shell: " + uri);
            session.loadUri(uri);
        });
    }

    /**
     * Avvia il server locale e restituisce l'URL della shell.
     *
     * <p>La shell viene prima copiata in storage interno: il server ne ha bisogno come
     * cartella, e in più è la stessa copia che NovaOS già usa per la shell aggiornata
     * via OTA — quindi la migrazione e l'OTA convergono sulla stessa disposizione.
     *
     * <p>Se la porta è occupata o la copia fallisce si ripiega sugli asset: la shell
     * parte comunque, in simulazione, perché un ponte mancante non deve impedire
     * l'avvio. È lo stesso degrado progettato della WebView senza nativo.
     */
    private String avviaServerLocale() {
        File dir = copiaShellInInterno();
        if (dir == null) return ASSET_INDEX;
        server = new ShellServer(dir, ShellServer.PORTA);
        String url = server.avvia();
        return url != null ? url : ASSET_INDEX;
    }

    /**
     * Riceve i comandi che il content script inoltra da {@code window.NovaNative}.
     *
     * <p>Nella fase 2 questa è ancora una <b>dimostrazione</b>: sono cablati due comandi
     * rappresentativi ({@code toast}, {@code vibrate}) per provare che la catena
     * pagina → content script → runtime → nativo regge end-to-end. Nella migrazione vera
     * il dispatcher inoltra ai 53 metodi di {@code MainActivity.NovaBridge}, che vive nel
     * modulo {@code :app} e non è visibile da qui.
     */
    private class BridgeMessages implements WebExtension.MessageDelegate {

        @Override
        public GeckoResult<Object> onMessage(String nativeApp, Object message,
                                             WebExtension.MessageSender sender) {
            String nome = null;
            Object[] args = new Object[0];
            // ATTENZIONE (scoperto il 2026-09-18): GeckoView consegna il messaggio come
            // org.mozilla.gecko.util.GeckoBundle, che implementa SOLO Parcelable — non
            // java.util.Map. Con un controllo `instanceof Map` il messaggio arrivava ma
            // il nome restava null: il ponte sembrava morto mentre il canale funzionava.
            if (message instanceof GeckoBundle) {
                GeckoBundle b = (GeckoBundle) message;
                nome = b.getString("nova");
                Object a = b.get("args");
                if (a instanceof Object[]) {
                    args = (Object[]) a;
                } else if (a instanceof List) {
                    args = ((List<?>) a).toArray();
                } else if (a != null) {
                    args = new Object[]{a};
                }
            } else if (message instanceof org.json.JSONObject) {
                // È QUESTO il formato reale dei messaggi di una WebExtension
                // (verificato il 2026-09-18): un JSONObject, con "args" come JSONArray.
                org.json.JSONObject o = (org.json.JSONObject) message;
                nome = o.optString("nova", null);
                org.json.JSONArray a = o.optJSONArray("args");
                if (a != null) {
                    args = new Object[a.length()];
                    for (int i = 0; i < a.length(); i++) args[i] = a.opt(i);
                }
            } else if (message instanceof Map) {
                Map<?, ?> m = (Map<?, ?>) message;
                Object n = m.get("nova");
                if (n != null) nome = String.valueOf(n);
                Object a = m.get("args");
                if (a instanceof Object[]) {
                    args = (Object[]) a;
                } else if (a instanceof List) {
                    args = ((List<?>) a).toArray();
                }
            } else if (message != null) {
                Log.w(TAG, "messaggio di tipo inatteso: " + message.getClass().getName()
                        + " valore=" + message);
            }
            // Il mittente dice da dove arriva il messaggio: "estensione" (script di
            // background) o "content-script" (la pagina). In GeckoView 155 il delegate
            // dell'estensione riceve entrambi.
            //
            // Correzione (2026-09-18): qui c'era scritto «non esiste più un
            // SessionController». È FALSO: `WebExtension.SessionController` esiste, è una
            // classe annidata (cercandola di primo livello non si trova) e offre
            // setMessageDelegate(WebExtension, MessageDelegate, String) per un delegate
            // legato alla singola sessione invece che all'estensione. Non serve qui — una
            // sola sessione, un solo delegate — ma va saputo: è la via per distinguere le
            // sessioni quando ne esisteranno più d'una.
            String ambiente = "?";
            if (sender != null) {
                ambiente = sender.environmentType == WebExtension.MessageSender.ENV_TYPE_CONTENT_SCRIPT
                        ? "content-script" : "estensione";
            }
            Log.i(TAG, "comando dal ponte: " + nome + " (" + args.length + " argomenti)"
                    + " ambiente=" + ambiente
                    + " da=" + (sender == null ? "?" : sender.url));
            if (nome == null) return GeckoResult.fromValue(null);

            // La sonda from-page innesca la risposta nativo → pagina: è il giro
            // completo in un solo gesto. Vedi rispondiAllaPagina().
            if ("__probe_stub".equals(nome)) rispondiAllaPagina();

            final String n2 = nome;
            final Object[] a2 = args;
            runOnUiThread(() -> esegui(n2, a2));
            return GeckoResult.fromValue(null);
        }

        /** Chiamata da GeckoView quando l'estensione apre una porta verso il nativo
         *  ({@code browser.runtime.connectNative("browser")} in background.js).
         *
         *  <p>È la via per il verso che mancava. {@code sendNativeMessage} va solo dalla
         *  pagina al nativo; una porta è bidirezionale e permette al nativo di parlare
         *  per primo — indispensabile per tutto ciò che nasce dal sistema e non da un
         *  gesto dell'utente: chiamata in arrivo, SMS, risultato del microfono,
         *  scadenza di un timer. Sotto WebView lo stesso ruolo lo aveva
         *  {@code evaluateJavascript}, che in GeckoView non esiste: le API di
         *  {@code GeckoSession} non offrono alcun modo di eseguire JS (verificato con
         *  javap sull'AAR: nessun metodo evaluate/inject/script). */
        @Override
        public void onConnect(WebExtension.Port port) {
            Log.i(TAG, "porta nativa aperta: nome=" + port.name
                    + " da=" + (port.sender == null ? "?" : port.sender.url));
            portaNativa = port;
            port.setDelegate(new PortMessages());
        }
    }

    /** Messaggi che risalgono la porta nativa (pagina → nativo su porta, invece che
     *  con {@code sendNativeMessage}). Oggi non ne arrivano: la shell usa
     *  {@code sendNativeMessage} per i comandi e la porta solo per il ritorno.
     *  Il delegate c'è lo stesso, perché un messaggio perso in silenzio è la diagnosi
     *  più costosa di questo ponte — meglio tre righe di log. */
    private class PortMessages implements WebExtension.PortDelegate {

        @Override
        public void onPortMessage(Object message, WebExtension.Port port) {
            Log.i(TAG, "messaggio sulla porta nativa: " + message);
        }

        @Override
        public void onDisconnect(WebExtension.Port port) {
            Log.i(TAG, "porta nativa chiusa dall'estensione");
            if (portaNativa == port) portaNativa = null;
        }
    }

    /** Prova che il nativo può raggiungere la pagina: manda un evento sulla porta
     *  nativa e lo fa comparire sullo schermo.
     *
     *  <p>Il percorso è tutto in discesa e ogni salto è già stato verificato separatamente:
     *  <ol>
     *    <li>Java → {@code Port.postMessage(JSONObject)}</li>
     *    <li>background.js ricopia il messaggio su ogni porta "nova-pagina"</li>
     *    <li>content.js lo rimette in pagina con {@code window.postMessage}</li>
     *    <li>lo stub lo consegna a {@code window.NovaMsg(evento, ...args)}</li>
     *  </ol>
     *
     *  <p>L'evento scelto non è neutro di proposito: {@code call.update} con stato
     *  {@code incoming} fa apparire la schermata di chiamata in arrivo, cioè la stessa
     *  che sotto WebView disegna l'InCallService. Se compare, il ponte regge in
     *  entrambi i versi e la prova è visibile senza leggere un log. Dopo 8 secondi
     *  arriva {@code ended}, così l'emulatore non suona all'infinito.
     *
     *  <p>L'attesa prima dell'invio non è un dettaglio di comodo: la sonda parte a
     *  {@code document_start}, quando la shell è ancora al boot. Una chiamata che arriva
     *  lì finisce dietro il lockscreen e il boot la cancella — provato: il log diceva
     *  «consegnato alla pagina» e sullo schermo non c'era nulla. Aspettando si verifica
     *  il caso vero, cioè un evento che raggiunge una shell già viva. */
    private static final long ATTESA_PROVA_MS = 15000;

    private void rispondiAllaPagina() {
        if (portaNativa == null) {
            Log.w(TAG, "nessuna porta nativa aperta: risposta non inviata");
            return;
        }
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (portaNativa != null) {
                    portaNativa.postMessage(evento("call.update", "incoming", "+39 340 1234567", "Anna Rossi"));
                    Log.i(TAG, "risposta inviata alla pagina: call.update incoming");
                }
            } catch (Exception e) {
                Log.e(TAG, "risposta non inviata", e);
            }
        }, ATTESA_PROVA_MS);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (portaNativa != null) {
                    portaNativa.postMessage(evento("call.update", "ended"));
                    Log.i(TAG, "risposta inviata alla pagina: call.update ended");
                }
            } catch (Exception e) {
                Log.e(TAG, "chiusura non inviata", e);
            }
        }, ATTESA_PROVA_MS + 8000);
    }

    /** Il formato che lo stub si aspetta: {@code {evento, args: [...]}}.
     *  Non è la forma dei comandi in salita ({@code {nova, args}}) perché i due versi
     *  hanno semantiche diverse: in salita è una richiesta con un nome di metodo, in
     *  discesa è un evento con dei valori da passare a un gestore. */
    private static org.json.JSONObject evento(String tipo, Object... args) {
        org.json.JSONObject o = new org.json.JSONObject();
        try {
            o.put("evento", tipo);
            o.put("args", new org.json.JSONArray(java.util.Arrays.asList(args)));
        } catch (Exception e) {
            Log.e(TAG, "evento non costruito: " + tipo, e);
        }
        return o;
    }

    /** I comandi cablati nella dimostrazione di fase 2. */
    private void esegui(String nome, Object[] args) {
        switch (nome) {
            case "toast": {
                String msg = args.length > 0 ? String.valueOf(args[0]) : "";
                Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
                break;
            }
            case "vibrate": {
                long ms = 100;
                try {
                    if (args.length > 0) ms = (long) Double.parseDouble(String.valueOf(args[0]));
                } catch (NumberFormatException ignored) {
                    // argomento non numerico: resta il valore predefinito
                }
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                }
                break;
            }
            case "openBrowser": {
                // Il comando per cui esiste tutto il ponte: senza di esso la shell
                // ripiega sulla sua anteprima in-app — il «browser vecchio» che si
                // vedeva nel dock. Stessa costruzione dell'Intent di :app
                // (MainActivity.java:531), così il comportamento è identico.
                Intent i = new Intent(this, BrowserActivity.class);
                i.putExtra("url", args.length > 0 ? String.valueOf(args[0]) : "");
                startActivity(i);
                break;
            }
            default:
                Log.i(TAG, "comando riconosciuto ma non ancora cablato: " + nome);
        }
    }

    /**
     * Copia la shell dagli assets in {@code files/shell} — la stessa disposizione che
     * NovaOS usa già per la shell aggiornata via OTA — e restituisce l'URL {@code file://}.
     */
    private String copyShellToInternalAndGetUrl() {
        File dir = copiaShellInInterno();
        if (dir == null) return ASSET_INDEX;
        return "file://" + new File(dir, "index.html").getAbsolutePath();
    }

    /** Copia integrale della shell in {@code files/shell}; null se fallisce. */
    private File copiaShellInInterno() {
        try {
            File dir = new File(getFilesDir(), "shell");
            // La copia è integrale: si riparte da zero, altrimenti i residui di un
            // avvio precedente (o di una versione precedente della shell) restano lì.
            deleteRecursively(dir);
            copyAsset(ASSET_SHELL, dir);
            File index = new File(dir, "index.html");
            Log.i(TAG, "shell interna: " + index.getAbsolutePath()
                    + " esiste=" + index.exists() + " eFile=" + index.isFile());
            return index.isFile() ? dir : null;
        } catch (Exception e) {
            Log.e(TAG, "copia in storage interno fallita: ripiego sugli asset", e);
            return null;
        }
    }

    /**
     * Copia ricorsivamente un percorso degli asset.
     *
     * <p>ATTENZIONE — scoperto dallo spike (2026-09-17): {@link android.content.res.AssetManager#list}
     * restituisce un array <b>vuoto</b>, non {@code null}, quando il percorso è un file.
     * Il controllo {@code children == null} quindi non scatta mai e ogni file finirebbe
     * trasformato in una cartella vuota ({@code index.html/}), con Gecko che al posto
     * della shell mostra un «Index of…» vuoto. L'unico modo affidabile di distinguere
     * file e cartelle è provare ad aprire il percorso come stream.
     */
    private void copyAsset(String assetPath, File dest) throws Exception {
        try (InputStream in = getAssets().open(assetPath)) {
            copyStreamToFile(in, dest);
            return;                       // era un file: copiato
        } catch (IOException nonUnFile) {
            // Non è apribile come file: è una cartella, si ricorre sui figli.
        }
        String[] children = getAssets().list(assetPath);
        if (!dest.exists() && !dest.mkdirs()) {
            throw new Exception("mkdirs fallita: " + dest);
        }
        if (children == null) return;
        for (String child : children) {
            copyAsset(assetPath + "/" + child, new File(dest, child));
        }
    }

    private void copyStreamToFile(InputStream in, File dest) throws Exception {
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new Exception("mkdirs fallita: " + parent);
        }
        try (OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    private void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursively(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /** Schermo intero, come la WebView di NovaOS. */
    private void immersive() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onBackPressed() {
        if (session != null) {
            session.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (server != null) {
            server.ferma();
            server = null;
        }
        if (session != null) {
            session.close();
            session = null;
        }
        super.onDestroy();
    }
}
