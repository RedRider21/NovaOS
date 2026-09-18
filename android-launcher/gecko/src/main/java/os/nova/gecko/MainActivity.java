package os.nova.gecko;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
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

    /** Codice della richiesta di permesso microfono (requestMic). */
    private static final int RICHIESTA_MIC = 4711;

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
            // -1 = comando fire-and-forget, nessuna risposta da dare. Un id >= 0
            // significa che la pagina sta aspettando una Promise: va risolta SEMPRE,
            // anche in errore, altrimenti il chiamante resta appeso (v. content.js).
            int idRichiesta = -1;
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
                idRichiesta = o.optInt("id", -1);
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
                    + (idRichiesta >= 0 ? " id=" + idRichiesta : "")
                    + " ambiente=" + ambiente
                    + " da=" + (sender == null ? "?" : sender.url));
            if (nome == null) return GeckoResult.fromValue(null);

            // La sonda from-page innesca la risposta nativo → pagina: è il giro
            // completo in un solo gesto. Vedi rispondiAllaPagina().
            if ("__probe_stub".equals(nome)) rispondiAllaPagina();

            // A pagina caricata si manda lo stato: vedi inviaStatoAllaShell().
            if ("__pagina_pronta".equals(nome)) inviaStatoAllaShell();

            final String n2 = nome;
            final Object[] a2 = args;
            final int id2 = idRichiesta;
            runOnUiThread(() -> esegui(n2, a2, id2));
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
     *  il caso vero, cioè un evento che raggiunge una shell già viva.
     *
     *  <p>Si attiva solo con {@code adb shell am start ... --ez prova true}: una chiamata
     *  finta che compare da sola dopo 15 secondi intralcia qualsiasi altra prova — è
     *  successo, il tocco su «Rifiuta» è finito sull'icona della Fotocamera sottostante
     *  e ha aperto un'altra app. Come diagnostica vale solo se non si attiva quando non
     *  serve. */
    private static final long ATTESA_PROVA_MS = 15000;

    private void rispondiAllaPagina() {
        if (!getIntent().getBooleanExtra("prova", false)) return;
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

    /** Manda un evento alla shell sulla porta nativa.
     *
     *  <p>È il corrispettivo di ciò che sotto WebView faceva
     *  {@code web.evaluateJavascript("window.NovaMsg('tipo', …)")}: stessa forma, stesso
     *  dispatcher dall'altra parte (la mappa {@code MSG} di shell/js/bridge.js). */
    private void inviaEvento(String tipo, Object... args) {
        if (portaNativa == null) {
            Log.w(TAG, "nessuna porta nativa aperta: evento non inviato: " + tipo);
            return;
        }
        try {
            portaNativa.postMessage(evento(tipo, args));
            Log.i(TAG, "evento inviato alla pagina: " + tipo);
        } catch (Exception e) {
            Log.e(TAG, "evento non inviato: " + tipo, e);
        }
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

    /** Manda alla shell i getter sincroni, che sotto Gecko non possono essere chiamati.
     *
     *  <p>Sotto WebView questi metodi rispondono <b>subito</b>: la pagina fa
     *  {@code window.NovaNative.appVersion()} e riceve una stringa. Sotto Gecko la
     *  comunicazione è a messaggi, quindi l'unico modo di avere il valore è che il
     *  nativo lo mandi <b>prima</b> che la shell lo chieda. Lo stub consegna questo
     *  oggetto a {@code NovaBridge.hydratePrefs(...)}, che lo mette nella cache di
     *  bridge.js: {@code NovaBridge.appVersion()} lo trova lì.
     *
     *  <p>Perché non esporre i getter come metodi dello stub: {@code has(nome)}
     *  diventerebbe vero, e {@code get()} restituirebbe {@code undefined} invece del
     *  default del chiamante — un guasto peggiore del ponte assente, perché silenzioso.
     *  La cache è l'unica via corretta.
     *
     *  <p>Qui sono cablati solo i getter che questa spike sa leggere <b>davvero</b>.
     *  {@code sensorStates} è omesso di proposito: inventarlo farebbe credere alla shell
     *  di poter commutare i sensori, che la spike non fa.
     *
     *  <p>Va detto che sotto Gecko <b>le preferenze non passano da qui</b>: {@code store}
     *  in os.js legge prima il nativo e poi ripiega su {@code localStorage}, che su
     *  {@code http://127.0.0.1} è affidabile e si legge a tempo di parsing. Questi
     *  getter sono la parte che il ripiego non copre. */
    private void inviaStatoAllaShell() {
        if (portaNativa == null) {
            Log.w(TAG, "nessuna porta nativa aperta: stato non inviato");
            return;
        }
        org.json.JSONObject s = new org.json.JSONObject();
        try {
            // appVersion: il contratto è una stringa JSON, non un oggetto.
            String nome = "?", codice = "0";
            try {
                android.content.pm.PackageInfo p =
                        getPackageManager().getPackageInfo(getPackageName(), 0);
                nome = p.versionName;
                long c = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P
                        ? p.getLongVersionCode() : p.versionCode;
                codice = String.valueOf(c);
            } catch (Exception e) {
                Log.w(TAG, "versione non leggibile", e);
            }
            s.put("appVersion", "{\"name\":\"" + nome + "\",\"code\":" + codice + "}");

            android.os.BatteryManager bm =
                    (android.os.BatteryManager) getSystemService(BATTERY_SERVICE);
            s.put("batteryLevel", bm == null ? -1
                    : bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY));

            boolean mic = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
            s.put("micGranted", mic);
            s.put("micReady", mic);
            boolean razionale = false;
            try { razionale = shouldShowRequestPermissionRationale(
                    android.Manifest.permission.RECORD_AUDIO); } catch (Exception ignored) {}
            s.put("micDiag", mic ? "granted" : (razionale ? "askable" : "blocked"));

            boolean dialer = false;
            try {
                android.telecom.TelecomManager tm =
                        (android.telecom.TelecomManager) getSystemService(TELECOM_SERVICE);
                dialer = tm != null && getPackageName().equals(tm.getDefaultDialerPackage());
            } catch (Exception ignored) {}
            s.put("isDialer", dialer);

            // privileged: WRITE_SECURE_SETTINGS non è concedibile a un'app normale,
            // quindi è una spia affidabile del fatto che si hanno poteri di sistema.
            boolean priv = false;
            try { priv = checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS")
                    == android.content.pm.PackageManager.PERMISSION_GRANTED; } catch (Exception ignored) {}
            s.put("privileged", priv);

            s.put("shellSource", getIntent().getStringExtra("origin") == null
                    ? ORIGIN_ASSET : getIntent().getStringExtra("origin"));

            // Nessuna infrastruttura di telefonia in questa spike: lo stato onesto è
            // "nessuna chiamata". La shell lo usa per il recupero della schermata al boot.
            s.put("currentCallState", "{\"state\":\"ended\"}");
        } catch (Exception e) {
            Log.e(TAG, "stato non costruito", e);
            return;
        }
        try {
            portaNativa.postMessage(evento("shell.state", s));
            Log.i(TAG, "stato inviato alla shell: " + s);
        } catch (Exception e) {
            Log.e(TAG, "stato non inviato", e);
        }
    }

    /**
     * Esito della richiesta di permesso microfono: risponde alla pagina e rinfresca lo
     * stato in cache.
     *
     * <p>Il rinfresco non è un di più: dopo la risposta, {@code micDiag} e {@code micGranted}
     * nella copia che la shell tiene in pagina sono quelli di prima. Se l'utente concede,
     * la shell continuerebbe a credersi senza permesso (o viceversa) fino al prossimo avvio.
     */
    @Override
    public void onRequestPermissionsResult(int codice, String[] permessi, int[] esiti) {
        super.onRequestPermissionsResult(codice, permessi, esiti);
        if (codice != RICHIESTA_MIC) return;
        boolean concesso = esiti.length > 0 && esiti[0] == PackageManager.PERMISSION_GRANTED;
        Log.i(TAG, "permesso microfono: " + (concesso ? "concesso" : "negato"));
        inviaEvento("mic.result", concesso);
        inviaStatoAllaShell();
    }

    /**
     * Risolve la Promise della pagina, sulla porta nativa.
     *
     * <p>È il gemello di {@code inviaEvento}, ma con un destinatario preciso invece che
     * «tutte le pagine»: {@code id} è quello che la pagina ha messo nel comando, e lo
     * stub lo usa per ritrovare la Promise giusta. Senza id non c'è risposta possibile.
     *
     * <p>Va chiamata <b>sempre</b>, anche quando il comando fallisce: il valore di
     * errore è parte del contratto (i default documentati in {@code bridge.js}), mentre
     * il silenzio lascia la shell appesa su un {@code await} che non torna.
     */
    private void inviaRisposta(int id, Object valore) {
        if (id < 0) return;
        if (portaNativa == null) {
            Log.w(TAG, "nessuna porta nativa aperta: risposta " + id + " non inviata");
            return;
        }
        try {
            // Campi con un nome, NON l'array {evento, args} usato dagli eventi.
            //
            // Scoperto a spese di un giro di prove: un JSONArray di tipi misti non
            // sopravvive alla conversione JSONObject → GeckoBundle che sta dietro
            // postMessage. `{"args":[1,"Download/x.json"]}` arrivava alla pagina come
            // `{"args":[1,0]}`: il numero passava, la stringa diventava 0, e la Promise
            // si risolveva con 0 senza un errore da nessuna parte. Gli eventi non se
            // n'erano accorti perché i loro array sono vuoti o contengono un solo
            // elemento dello stesso tipo.
            //
            // Una risposta ha per natura un id e un valore di tipo imprevedibile:
            // nominarli è più solido di contarli, e non dipende da come il motore
            // serializza gli array.
            org.json.JSONObject o = new org.json.JSONObject();
            o.put("evento", "__novaRisposta");
            o.put("id", id);
            o.put("valore", valore == null ? org.json.JSONObject.NULL : valore);
            Log.i(TAG, "risposta grezza: " + o);
            portaNativa.postMessage(o);
            Log.i(TAG, "risposta inviata: id=" + id + " valore=" + valore);
        } catch (Exception e) {
            Log.e(TAG, "risposta non inviata: id=" + id, e);
        }
    }

    /** I comandi cablati nella dimostrazione di fase 2. */
    private void esegui(String nome, Object[] args, int idRichiesta) {
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
            case "requestMic": {
                // Primo comando cablato che NON finisce in un log: chiede il permesso e
                // ne rimanda l'esito alla pagina. Sotto WebView lo faceva
                // onPermissionRequest (:212-227) chiamando __novaMic(ok); qui la stessa
                // risposta viaggia come evento mic.result sulla porta nativa, e lo stub
                // la consegna a window.NovaMsg — che è la funzione da cui la shell
                // appende __novaMic (shell/js/apps.js:4217). Il giro è identico.
                //
                // Se il permesso c'è già non c'è dialogo da mostrare e si risponde
                // subito: senza questo ramo il primo tocco su «registra» non farebbe
                // nulla e sembrerebbe rotto.
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                    inviaEvento("mic.result", true);
                } else {
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RICHIESTA_MIC);
                }
                break;
            }
            case "saveDownload": {
                // Primo comando di richiesta/risposta: la pagina aspetta il percorso del
                // file. Stessa costruzione di :app (MainActivity.java:898), ma il valore
                // non torna con il `return` — torna con inviaRisposta, perché di mezzo c'è
                // un confine di processo e un JSON.
                //
                // Il default di questo comando in bridge.js è "" (stringa vuota): qui è
                // anche il valore di errore, quindi un fallimento e un rifiuto del
                // sistema si comportano allo stesso modo, come sotto WebView.
                String esito = "";
                try {
                    String nomeFile = args.length > 0 ? String.valueOf(args[0]) : "nova.json";
                    String base64 = args.length > 1 ? String.valueOf(args[1]) : "";
                    byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    if (android.os.Build.VERSION.SDK_INT >= 29) {
                        android.content.ContentValues cv = new android.content.ContentValues();
                        cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, nomeFile);
                        cv.put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/json");
                        cv.put(android.provider.MediaStore.Downloads.IS_PENDING, 1);
                        Uri uri = getContentResolver().insert(
                                android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (uri == null) throw new IOException("MediaStore insert nullo");
                        OutputStream out = getContentResolver().openOutputStream(uri);
                        out.write(bytes);
                        out.close();
                        cv.clear();
                        cv.put(android.provider.MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, cv, null, null);
                        esito = "Download/" + nomeFile;
                    } else {
                        File dir = android.os.Environment
                                .getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
                        if (!dir.exists()) dir.mkdirs();
                        File f = new File(dir, nomeFile);
                        FileOutputStream fo = new FileOutputStream(f);
                        fo.write(bytes);
                        fo.close();
                        esito = f.getAbsolutePath();
                    }
                    Toast.makeText(this, "File salvato in Download", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Log.e(TAG, "saveDownload non riuscito", e);
                    Toast.makeText(this, "Salvataggio non riuscito", Toast.LENGTH_SHORT).show();
                }
                inviaRisposta(idRichiesta, esito);
                break;
            }
            case "openAppSettings": {
                // Utile subito: dopo un diniego definitivo la shell manda l'utente qui.
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", getPackageName(), null));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception e) {
                    Log.w(TAG, "impostazioni app non apribili", e);
                }
                break;
            }
            default:
                Log.i(TAG, "comando riconosciuto ma non ancora cablato: " + nome);
                // Se la pagina sta aspettando, va comunque risolta. Questo ramo non
                // dovrebbe mai essere raggiunto con un id: lo stub espone solo i nomi
                // che compaiono qui sopra. Se succede, è un elenco disallineato — e il
                // sintomo, senza questa riga, sarebbe una shell appesa e nessun errore.
                if (idRichiesta >= 0) {
                    Log.w(TAG, "richiesta senza risposta cablata: " + nome
                            + " — rispondo null per non lasciare la pagina appesa");
                    inviaRisposta(idRichiesta, null);
                }
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

    /**
     * Tasto Indietro: lo consuma la shell, non la cronologia del browser.
     *
     * <p>Sotto WebView era {@code web.evaluateJavascript("window.NovaBack && window.NovaBack()")}
     * ({@code :app} {@code MainActivity.java:1084}). Gecko non ha {@code evaluateJavascript}:
     * la stessa chiamata viaggia come evento {@code back} sulla porta nativa, e lo stub la
     * consegna a {@code window.NovaBack} — la stessa funzione ({@code shell/js/os.js:1899}),
     * che chiude lo shade se è aperto oppure esce dall'app se ce n'è una aperta.
     *
     * <p>{@code session.goBack()} — il comportamento che questo file aveva prima — è la
     * navigazione <b>indietro del browser</b>, che con la shell non c'entra nulla: la shell è
     * una pagina sola, quindi non c'è cronologia da percorrere e il tasto sembrava morto.
     * È il primo caso in cui il porting non è stato «stessa cosa con un'altra API» ma
     * «la stessa API qui significa un'altra cosa».
     *
     * <p>Il ripiego su {@code super.onBackPressed()} scatta solo a ponte spento (shell non
     * servita, estensione non caricata): lì la shell non riceverebbe nulla e senza ripiego
     * l'app diventerebbe impossibile da chiudere. A ponte vivo il comportamento è identico a
     * {@code :app}, che inoltra sempre e non chiude mai l'Activity.
     */
    @Override
    public void onBackPressed() {
        if (portaNativa != null) {
            inviaEvento("back");
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
