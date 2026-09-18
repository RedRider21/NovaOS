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
import org.mozilla.geckoview.GeckoSession.PermissionDelegate.MediaSource;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.gecko.util.GeckoBundle;

import java.util.List;
import java.util.Map;

import java.io.File;
import java.io.FileInputStream;
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
 *   <li>{@code asset} &rarr; {@code resource://android/assets/www/index.html}: la shell
 *       gira, ma <b>senza ponte</b> — resta come riferimento di fase 0 e come ripiego di
 *       {@link #avviaServerLocale()}, non più come origine predefinita (v. {@link #onCreate}).</li>
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
    /** Richiesta dei permessi che la pagina chiede via {@code getUserMedia}. */
    private static final int RICHIESTA_MEDIA = 4712;
    /** Richiesta del permesso SEND_SMS, fatta da {@code sendSms} quando manca.
     *
     *  <p>L'esito non viene letto: non c'è niente da rispondere alla pagina, che ha
     *  già ricevuto il suo «inoltrato». Serve solo a far comparire il dialogo, così
     *  la <b>prossima</b> chiamata a {@code sendSms} trova il permesso e invia
     *  davvero invece di riaprire l'app SMS. */
    private static final int RICHIESTA_SMS = 4713;

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
     *  aperta finché l'estensione non la chiude. Vedi {@link #inviaEvento}. */
    private WebExtension.Port portaNativa;

    private static final String ASSET_SHELL = "www";      // src/main/assets/www
    private static final String ASSET_INDEX = "resource://android/assets/www/index.html";

    private GeckoRuntime runtime;
    private GeckoSession session;
    private GeckoView view;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // L'origine predefinita è `local`, non più `asset`. Scoperto così: lanciando
        // l'app dall'icona (o lasciando che sia NovaInCallService ad avviarla per una
        // chiamata in arrivo) l'intent non porta extra, si finiva su
        // `resource://android/assets/…` — l'origine su cui il content script NON viene
        // iniettato — e la shell partiva senza ponte. Cioè: un telefono che si apre
        // dall'icona era un telefono che non telefona, non condivide e non aggiorna,
        // senza che nulla lo dicesse. `asset` resta raggiungibile con
        // `--es origin asset` per il confronto di fase 0, ma non è più la porta
        // d'ingresso.
        String origin = getIntent().getStringExtra("origin");
        if (origin == null) origin = ORIGIN_LOCAL;

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
        session.setPermissionDelegate(new PermessiMedia());
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
        File dir = preparaShell();
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

    /** Manda alla shell lo stato della chiamata corrente: chiamata in arrivo, stato
     *  cambiato, chiamata chiusa.
     *
     *  <p>Sostituisce la sonda di fase 2, che mandava un {@code call.update} finto
     *  dopo 15 secondi per provare che l'evento arrivasse. Ora l'evento arriva da
     *  {@link CallHub}, cioè da una chiamata vera, quindi la sonda non ha più niente
     *  da dimostrare — e il suo difetto era proprio quello che la rendeva utile: una
     *  chiamata che compare da sola mentre si prova altro.
     *
     *  <p>Chiamata da {@link CallHub} a ogni cambio di stato (che avviene sul thread
     *  di telecom, non sul nostro) e da {@link #onResume}: il {@code post} sul thread
     *  principale non è una precauzione di stile, perché la porta nativa appartiene al
     *  thread che l'ha aperta.
     *
     *  <p>Il {@code try} attorno alla lettura dello stato rispecchia quello di
     *  {@code inviaStatoAllaShell}: fra il momento in cui il framework ci avvisa e
     *  quello in cui leggiamo, la chiamata può essere già sparita. «Nessuna
     *  chiamata» invece non è un'anomalia e non arriva qui: la assorbe
     *  {@link CallHub#stato()}, che risponde {@code ended}. */
    public void pushCall() {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            String stato = "ended", numero = "";
            try {
                stato = CallHub.stato();
                numero = CallHub.numero();
            } catch (Exception e) {
                Log.w(TAG, "stato della chiamata non leggibile", e);
            }
            inviaEvento("call.update", stato, numero, "");
        });
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

            // isDialer() invece del controllo ripetuto qui: lo stesso valore decide
            // anche il ramo di `call`, e due copie divergerebbero. Il try/catch resta
            // perché questo giro costruisce TUTTO lo stato: un'eccezione qui farebbe
            // saltare l'invio, non solo questo campo.
            boolean dialer = false;
            try { dialer = isDialer(); } catch (Exception ignored) {}
            s.put("isDialer", dialer);

            // privileged: WRITE_SECURE_SETTINGS non è concedibile a un'app normale,
            // quindi è una spia affidabile del fatto che si hanno poteri di sistema.
            boolean priv = false;
            try { priv = checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS")
                    == android.content.pm.PackageManager.PERMISSION_GRANTED; } catch (Exception ignored) {}
            s.put("privileged", priv);

            s.put("shellSource", getIntent().getStringExtra("origin") == null
                    ? ORIGIN_LOCAL : getIntent().getStringExtra("origin"));

            // Lo stato VERO della chiamata, non più il finto onesto di prima. La shell
            // lo legge una volta sola, all'avvio (os.js, recupero della schermata di
            // chiamata): con il valore fisso quella schermata non poteva mai comparire
            // dopo un riavvio di NovaOS a conversazione in corso.
            //
            // Il ripiego a "ended" quando non c'è chiamata non è un doppione del
            // controllo dentro CallHub: quel metodo risponde null per dire «nessuna
            // chiamata», e alla shell serve comunque un JSON valido.
            String chiamata = null;
            try { chiamata = CallHub.statoJson(); } catch (Exception e) {
                Log.w(TAG, "stato della chiamata non leggibile", e);
            }
            s.put("currentCallState", chiamata == null ? "{\"state\":\"ended\"}" : chiamata);
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

    /** Vero mentre un dialogo di permessi è aperto: Android ne accetta uno per volta. */
    private boolean permessiInCorso = false;
    private final java.util.ArrayDeque<Runnable> permessiInCoda = new java.util.ArrayDeque<>();

    /**
     * Chiede i permessi adesso, oppure mette la richiesta in coda.
     *
     * <p><b>Perché una coda, e non due chiamate dirette.</b> Verificato il 2026-09-18:
     * Android accetta <i>una sola</i> richiesta di permessi per volta. La shell però ne
     * fa due a distanza di 40 ms — <code>NB().cmd("requestMic")</code> e subito dopo
     * <code>getUserMedia</code>, che passa dal {@link PermessiMedia} — e la seconda
     * veniva rifiutata all'istante:
     *
     * <pre>W Activity: Can request only one set of permissions at a time</pre>
     *
     * <p>Quel rifiuto è <b>tecnico, non dell'utente</b>, ma è indistinguibile da un
     * diniego: {@code getUserMedia} fallisce, la shell ripiega sul registratore nativo
     * (non cablato) e mostra l'avviso sul microfono. La diagnosi punta al microfono,
     * che non c'entra nulla. Serializzando le richieste, il secondo dialogo arriva
     * quando il primo si è chiuso — che è anche l'ordine in cui l'utente se li aspetta.
     */
    private void unPermessoAllaVolta(Runnable richiesta) {
        if (permessiInCorso) {
            Log.i(TAG, "richiesta di permessi in coda: ce n'è già una aperta");
            permessiInCoda.add(richiesta);
            return;
        }
        permessiInCorso = true;
        richiesta.run();
    }

    /**
     * Passa il turno alla prossima richiesta accodata. Va chiamata alla fine di ogni
     * {@code onRequestPermissionsResult}: è l'unico momento in cui il turno si libera.
     */
    private void turnoSuccessivoDeiPermessi() {
        // `permessiInCorso` resta vero quando c'è un'altra richiesta da fare: azzerarlo
        // qui riaprirebbe la porta a una richiesta diretta mentre questa è già partita.
        Runnable prossima = permessiInCoda.poll();
        if (prossima == null) {
            permessiInCorso = false;
            return;
        }
        prossima.run();
    }

    /**
     * Esito della richiesta di permesso microfono: risponde alla pagina e rinfresca lo
     * stato in cache.
     *
     * <p>Il rinfresco non è un di più: dopo la risposta, {@code micDiag} e {@code micGranted}
     * nella copia che la shell tiene in pagina sono quelli di prima. Se l'utente concede,
     * la shell continuerebbe a credersi senza permesso (o viceversa) fino al prossimo avvio.
     *
     * <p>Da qui passa anche l'esito dei permessi media, e in entrambi i rami l'ultima riga
     * libera il turno: è l'unico punto in cui un dialogo si chiude, quindi è l'unico punto
     * in cui la coda di {@link #unPermessoAllaVolta} può avanzare.
     */
    @Override
    public void onRequestPermissionsResult(int codice, String[] permessi, int[] esiti) {
        super.onRequestPermissionsResult(codice, permessi, esiti);
        if (codice == RICHIESTA_MEDIA) {
            // `tutti` e non il primo esito: una richiesta audio+video concede due
            // permessi, e se solo uno passa il grant completo sarebbe una bugia.
            boolean tutti = esiti.length > 0;
            for (int e : esiti) if (e != PackageManager.PERMISSION_GRANTED) tutti = false;
            Log.i(TAG, "permessi media per la pagina: " + (tutti ? "concessi" : "negati"));
            rispondiAllaRichiestaMedia(tutti);
            inviaStatoAllaShell();
        } else if (codice == RICHIESTA_MIC) {
            boolean concesso = esiti.length > 0 && esiti[0] == PackageManager.PERMISSION_GRANTED;
            Log.i(TAG, "permesso microfono: " + (concesso ? "concesso" : "negato"));
            inviaEvento("mic.result", concesso);
            inviaStatoAllaShell();
        }
        turnoSuccessivoDeiPermessi();
    }

    /** La richiesta di {@code getUserMedia} che aspetta il consenso di Android. */
    private GeckoSession.PermissionDelegate.MediaCallback mediaInAttesa;
    private MediaSource[] videoInAttesa, audioInAttesa;

    private void rispondiAllaRichiestaMedia(boolean concesso) {
        GeckoSession.PermissionDelegate.MediaCallback cb = mediaInAttesa;
        MediaSource[] v = videoInAttesa, a = audioInAttesa;
        mediaInAttesa = null; videoInAttesa = null; audioInAttesa = null;
        if (cb == null) return;
        if (concesso) cb.grant(v != null && v.length > 0 ? v[0] : null,
                              a != null && a.length > 0 ? a[0] : null);
        else cb.reject();
    }

    /**
     * I permessi che la pagina chiede al motore — oggi solo microfono e fotocamera.
     *
     * <p><b>Perché serve, e non è una formalità.</b> Senza un {@code PermissionDelegate},
     * GeckoView nega ogni richiesta di {@code getUserMedia}: la pagina riceve un
     * {@code NotAllowedError} e la shell ripiega sul registratore nativo — o, per la
     * fotocamera, mostra l'anteprima nera. Il sintomo non porta da nessuna parte: sembra
     * che il microfono non funzioni, mentre è il contenitore che non ha mai risposto.
     *
     * <p>Questo è il pezzo che decide se il registratore può essere <b>web-puro</b> sulla
     * traccia A: se {@code getUserMedia} cattura davvero l'audio, {@code audioRecStart} e
     * {@code audioRecStop} non vanno cablati affatto — e spariscono il fallback nativo,
     * l'audio in base64 e un comando di richiesta/risposta. Non è una previsione: è ciò
     * che questa classe esiste per verificare.
     *
     * <p>Il consenso si chiede ad Android con i suoi permessi, e solo dopo si risponde a
     * Gecko. Concedere a Gecko senza il permesso di sistema darebbe alla pagina un
     * microfono che non capta nulla: di nuovo un guasto che non somiglia a un guasto.
     */
    private class PermessiMedia implements GeckoSession.PermissionDelegate {

        @Override
        public void onMediaPermissionRequest(GeckoSession sessione, String uri,
                                             MediaSource[] video, MediaSource[] audio,
                                             MediaCallback callback) {
            Log.i(TAG, "la pagina chiede i media: video=" + (video != null && video.length > 0)
                    + " audio=" + (audio != null && audio.length > 0));
            if (mediaInAttesa != null) {
                // Due richieste di media insieme: la seconda non ha un posto dove stare,
                // e tenerla in attesa dietro la prima significherebbe rispondere a una
                // pagina che nel frattempo ha già rinunciato. Meglio un rifiuto subito.
                Log.w(TAG, "richiesta media già in corso: rifiuto la seconda");
                callback.reject();
                return;
            }
            mediaInAttesa = callback;
            videoInAttesa = video;
            audioInAttesa = audio;
            // Non si chiede subito: si chiede il turno. Se `requestMic` è appena partito
            // (la shell lo chiama 40 ms prima di getUserMedia), questa richiesta aspetta
            // che quel dialogo si chiuda invece di essere rifiutata da Android.
            unPermessoAllaVolta(PermessiMedia.this::chiediAdesso);
        }

        /**
         * Il corpo della richiesta, eseguito quando è il nostro turno.
         *
         * <p>Ricontrolla i permessi invece di usare quelli calcolati prima di mettersi in
         * coda, e non è una ripetizione inutile: se nel frattempo l'utente ha concesso il
         * microfono dal dialogo di {@code requestMic}, qui non c'è più niente da chiedere
         * e si concede direttamente — senza un secondo dialogo identico, che sembrerebbe
         * un'app che non prende la risposta.
         */
        private void chiediAdesso() {
            if (mediaInAttesa == null) { turnoSuccessivoDeiPermessi(); return; }
            boolean vuoleVideo = videoInAttesa != null && videoInAttesa.length > 0;
            boolean vuoleAudio = audioInAttesa != null && audioInAttesa.length > 0;

            java.util.ArrayList<String> mancanti = new java.util.ArrayList<>();
            if (vuoleAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                mancanti.add(Manifest.permission.RECORD_AUDIO);
            }
            if (vuoleVideo && checkSelfPermission(Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                mancanti.add(Manifest.permission.CAMERA);
            }
            if (mancanti.isEmpty()) {
                // Caso tutt'altro che raro: `requestMic` ha appena chiesto il microfono e
                // l'utente ha appena risposto sì. Qui non c'è niente da chiedere.
                Log.i(TAG, "media già consentiti: concedo senza un secondo dialogo");
                rispondiAllaRichiestaMedia(true);
                turnoSuccessivoDeiPermessi();
                return;
            }
            requestPermissions(mancanti.toArray(new String[0]), RICHIESTA_MEDIA);
        }
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

    /** L'argomento {@code i}-esimo di un comando, o stringa vuota se non c'è.
     *
     *  <p>La pagina manda sempre stringhe per i comandi di telefonia, ma il ponte le
     *  consegna come {@code Object} senza tipo: leggerle con un cast diretto
     *  significherebbe un {@code ClassCastException} per un argomento mancante, che
     *  dalla parte della shell arriva come «comando fallito» senza indizi. */
    private static String argomento(Object[] args, int i) {
        return (args != null && args.length > i && args[i] != null) ? String.valueOf(args[i]) : "";
    }

    /** Un argomento booleano del ponte ({@code callMute}, {@code callSpeaker}).
     *
     *  <p>La pagina manda un booleano vero, ma attraversando lo stub, il content
     *  script e il JSON di Gecko può arrivare come {@code Boolean}, come
     *  {@code Double} o perfino come la stringa {@code "true"} — e un cast diretto a
     *  {@code Boolean} lancerebbe {@code ClassCastException} su due di questi tre.
     *  Qui non lancia mai, e il verso del dubbio è quello giusto per un interruttore:
     *  ciò che non si capisce è spento. */
    private static boolean booleano(Object[] args, int i) {
        if (args == null || args.length <= i || args[i] == null) return false;
        Object v = args[i];
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof Number) return ((Number) v).doubleValue() != 0;
        return "true".equals(String.valueOf(v));
    }

    /** Avvia un Intent verso un'app di sistema.
     *
     *  <p>L'eccezione viene trattenuta qui e non lasciata salire, per una ragione che
     *  vale la pena scrivere perché è controintuitiva: sotto Gecko {@code cmd()} è
     *  <b>asincrono</b>, quindi non può osservare un fallimento del nativo — la shell
     *  crede di aver aperto qualcosa in ogni caso. Lasciar salire l'eccezione non le
     *  farebbe prendere il ripiego: le farebbe perdere il processo (vedi
     *  {@link #esegui}). Che l'apertura sia riuscita resta quindi ignoto alla pagina;
     *  è il limite noto del ponte, e sta nel log. */
    private void apri(Intent i) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "nessuna app per " + i.getAction() + " " + i.getData(), e);
        }
    }

    /** Apre l'app di messaggistica di sistema col numero e il testo già pronti. */
    private void apriSms(String numero, String testo) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + numero));
        i.putExtra("sms_body", testo == null ? "" : testo);
        apri(i);
    }

    /** L'estensione da dare al file, dedotta dal mime del data URL.
     *
     *  <p>Serve solo quando il nome non ne porta già una: la galleria e il
     *  registratore mandano un data URL e nient'altro, e un file senza estensione
     *  molte app lo rifiutano prima ancora di guardarne il contenuto. */
    private static String estensione(String mime) {
        if (mime.contains("png"))  return ".png";
        if (mime.contains("jpeg") || mime.contains("jpg")) return ".jpg";
        if (mime.contains("webp")) return ".webp";
        if (mime.contains("gif"))  return ".gif";
        if (mime.contains("mp4") || mime.contains("m4a") || mime.contains("aac")) return ".m4a";
        if (mime.contains("mpeg")) return ".mp3";
        if (mime.contains("webm")) return ".webm";
        if (mime.contains("ogg"))  return ".ogg";
        if (mime.contains("wav"))  return ".wav";
        if (mime.contains("pdf"))  return ".pdf";
        // Un'immagine non riconosciuta resta un'immagine: .jpg è la scelta di :app,
        // che per shareImage aveva solo questo ramo.
        if (mime.startsWith("image/")) return ".jpg";
        return ".bin";
    }

    /** Scrive un data URL nella cache dell'app e apre il chooser di sistema.
     *
     *  <p>Unifica {@code shareImage} e {@code shareFile} di
     *  {@code :app/MainActivity.java:538-598}, che differivano solo nel nome da dare
     *  al file — la foto lo prende dal timestamp, il file dal suo nome vero — mentre
     *  decodifica, estensione e chooser erano copiati. Porta anche le due righe che
     *  nel modulo :app hanno un commento proprio perché sembrano dettagli:
     *
     *  <ul>
     *  <li>{@code setClipData}: senza, {@code FLAG_GRANT_READ_URI_PERMISSION} non
     *      raggiunge l'app scelta nel chooser. Il permesso su un URI viaggia con
     *      l'Intent, ma quando l'Intent passa dal chooser quello che arriva alla
     *      destinazione è ricostruito dal ClipData: l'app riceverebbe l'URI e non
     *      potrebbe aprirlo — una condivisione che «non funziona» senza un errore.</li>
     *  <li>l'autorità: {@code "content://" + ShareProvider.AUTHORITY} deve
     *      corrispondere alla voce {@code <provider>} del manifest. Se diverge,
     *      nessuno solleva: il sistema semplicemente non trova il provider.</li>
     *  </ul>
     *
     *  <p>Un fallimento non può tornare alla shell — sotto Gecko il ponte è
     *  asincrono, {@code cmd()} non osserva l'esito — quindi l'unico segnale è il
     *  Toast, come in :app, più la traccia nel log.
     *
     *  @param nome nome proposto per il file; vuoto per le immagini, che non ne hanno.
     */
    private void condividi(String dataUrl, String nome, String etichetta) {
        try {
            int comma = dataUrl.indexOf(',');
            if (comma < 0) throw new IllegalArgumentException("data URL senza virgola");
            String mime = dataUrl.substring(dataUrl.indexOf(':') + 1, comma).split(";")[0];
            byte[] bytes = android.util.Base64.decode(dataUrl.substring(comma + 1),
                    android.util.Base64.DEFAULT);

            File dir = new File(getCacheDir(), "share");
            dir.mkdirs();
            // Il nome arriva dalla pagina, quindi non è fidato: le barre e i due punti
            // verrebbero interpretati come percorso, e scriveremmo fuori dalla cache.
            String pulito = (nome == null || nome.trim().isEmpty())
                    ? "novaos-" + System.currentTimeMillis()
                    : nome.replaceAll("[^A-Za-z0-9._ -]", "_");
            if (pulito.indexOf('.') < 0) pulito = pulito + estensione(mime);
            File f = new File(dir, pulito);
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(bytes);
            fos.close();

            Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + f.getName());
            Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(android.content.ClipData.newUri(getContentResolver(), f.getName(), uri));
            apri(Intent.createChooser(send, etichetta)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch (Exception e) {
            Log.w(TAG, "condivisione non riuscita", e);
            Toast.makeText(this, "Condivisione non riuscita", Toast.LENGTH_SHORT).show();
        }
    }

    /** NovaOS è il telefono predefinito (ROLE_DIALER)?
     *
     *  <p>Da lì {@code NovaInCallService} riceve le chiamate vere: senza il ruolo il
     *  servizio non viene mai legato e i cinque comandi di dentro-chiamata non hanno
     *  su cosa agire. Stessa forma di {@code :app/MainActivity.java:302-310}. */
    private boolean isDialer() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            android.app.role.RoleManager rm =
                    (android.app.role.RoleManager) getSystemService(ROLE_SERVICE);
            return rm != null && rm.isRoleHeld(android.app.role.RoleManager.ROLE_DIALER);
        }
        android.telecom.TelecomManager tm =
                (android.telecom.TelecomManager) getSystemService(TELECOM_SERVICE);
        return tm != null && getPackageName().equals(tm.getDefaultDialerPackage());
    }

    /** Smistamento dei comandi, con la rete di sicurezza attorno.
     *
     *  <p>Il try/catch non è difensivismo: sotto Gecko il ponte è <b>asincrono</b>, e
     *  un'eccezione qui non torna alla pagina come «comando fallito» — risale il thread
     *  principale e <b>uccide il processo</b>. Verificato a spese di una prova:
     *  {@code vibrate} senza il permesso VIBRATE dichiarato faceva esattamente questo,
     *  e la shell moriva prima di poter usare il proprio ripiego. Sotto WebView non
     *  succedeva perché la chiamata era sincrona e {@code cmd()} poteva intercettare
     *  l'errore: questo try/catch sostituisce la protezione che il ponte vecchio
     *  aveva gratis. Va tenuto per quanto è largo — un comando su 53 che lancia non
     *  deve costare la shell intera. */
    private void esegui(String nome, Object[] args, int idRichiesta) {
        try {
            eseguiComando(nome, args, idRichiesta);
        } catch (Throwable t) {
            Log.e(TAG, "comando fallito: " + nome, t);
            // Se la pagina aspettava una risposta va comunque data: un `await` che non
            // torna è peggio di un valore di errore, che il contratto già prevede.
            if (idRichiesta >= 0) {
                try { inviaRisposta(idRichiesta, null); } catch (Exception ignored) {}
            }
        }
    }

    /** I comandi cablati nella dimostrazione di fase 2. */
    private void eseguiComando(String nome, Object[] args, int idRichiesta) {
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
            case "call": {
                // Tre livelli, e il primo non è una scorciatoia: se NovaOS è il
                // telefono predefinito si compone dal framework telecom, così la
                // chiamata esce <b>e</b> il nostro InCallService mostra la schermata
                // NovaOS. Con ACTION_CALL la richiesta ricadrebbe su NovaOS stessa —
                // un ciclo che non chiama nessuno. Porta
                // {@code :app/MainActivity.java:360-378}.
                Uri uri = Uri.parse("tel:" + String.valueOf(argomento(args, 0)));
                if (isDialer() && checkSelfPermission(Manifest.permission.CALL_PHONE)
                        == PackageManager.PERMISSION_GRANTED) {
                    android.telecom.TelecomManager tm =
                            (android.telecom.TelecomManager) getSystemService(TELECOM_SERVICE);
                    if (tm != null) {
                        try {
                            tm.placeCall(uri, null);
                            Log.i(TAG, "call: compongo dal framework telecom (" + uri + ")");
                            break;
                        } catch (Exception e) {
                            Log.w(TAG, "placeCall non riuscito: ripiego sull'Intent", e);
                        }
                    }
                }
                boolean puoChiamare = checkSelfPermission(Manifest.permission.CALL_PHONE)
                        == PackageManager.PERMISSION_GRANTED;
                // Quale dei tre livelli scatta dipende dai permessi, che cambiano da
                // dispositivo a dispositivo: senza questa riga, un ACTION_DIAL al posto
                // di un ACTION_CALL non dice se è la scelta voluta o un permesso mancante.
                Log.i(TAG, "call: dialer=" + isDialer() + " CALL_PHONE=" + puoChiamare
                        + " → " + (puoChiamare ? "ACTION_CALL" : "ACTION_DIAL"));
                apri(new Intent(puoChiamare ? Intent.ACTION_CALL : Intent.ACTION_DIAL, uri));
                break;
            }
            case "sms":
                // Non manda nulla: apre l'app di messaggistica col testo pronto. È il
                // comportamento di :app, ed è anche il ripiego di sendSms.
                apriSms(String.valueOf(argomento(args, 0)), String.valueOf(argomento(args, 1)));
                break;
            case "sendSms": {
                String numero = String.valueOf(argomento(args, 0));
                String testo = String.valueOf(argomento(args, 1));
                if (numero.isEmpty()) break;
                if (checkSelfPermission(Manifest.permission.SEND_SMS)
                        != PackageManager.PERMISSION_GRANTED) {
                    // Si chiede il permesso e Intanto si apre l'app SMS: la shell non
                    // saprebbe cosa farsene di un «aspetta», e il suo ramo di ripiego
                    // è identico a questo.
                    requestPermissions(new String[]{Manifest.permission.SEND_SMS}, RICHIESTA_SMS);
                    apriSms(numero, testo);
                    break;
                }
                try {
                    android.telephony.SmsManager sm = android.telephony.SmsManager.getDefault();
                    sm.sendMultipartTextMessage(numero, null, sm.divideMessage(testo), null, null);
                    Log.i(TAG, "SMS inviato direttamente (parti: "
                            + sm.divideMessage(testo).size() + ")");
                } catch (Exception e) {
                    Log.w(TAG, "invio diretto non riuscito: ripiego sull'app SMS", e);
                    apriSms(numero, testo);
                }
                break;
            }

            // ---- dentro la chiamata ------------------------------------------
            //
            // Questi cinque non fanno nulla da soli: inoltrano a CallHub, che agisce
            // sulla chiamata tenuta da NovaInCallService. Se NovaOS non è il telefono
            // predefinito quel servizio non è mai stato legato, CallHub.call è null e
            // i comandi non hanno effetto — che è esattamente ciò che deve succedere,
            // perché la shell mostra la schermata di chiamata solo quando è il dialer.

            case "requestDialerRole": {
                // Il prerequisito dei cinque qui sotto, non un extra: senza il ruolo
                // NovaInCallService non riceve mai una chiamata, e i comandi non
                // avrebbero su cosa agire. Porta :app/MainActivity.java:313-324.
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    android.app.role.RoleManager rm =
                            (android.app.role.RoleManager) getSystemService(ROLE_SERVICE);
                    if (rm != null && rm.isRoleAvailable(android.app.role.RoleManager.ROLE_DIALER)
                            && !rm.isRoleHeld(android.app.role.RoleManager.ROLE_DIALER)) {
                        // L'esito non viene letto: il ruolo concesso si riflette da solo
                        // in isDialer(), che la shell rilegge a ogni invio di stato.
                        startActivityForResult(
                                rm.createRequestRoleIntent(android.app.role.RoleManager.ROLE_DIALER), 2);
                    }
                } else {
                    apri(new Intent(android.telecom.TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
                            .putExtra(android.telecom.TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME,
                                    getPackageName()));
                }
                break;
            }
            case "callAnswer":  CallHub.answer();  break;
            case "callHangup":  CallHub.hangup();  break;
            case "callMute":    CallHub.mute(booleano(args, 0));    break;
            case "callSpeaker": CallHub.speaker(booleano(args, 0)); break;
            case "callDtmf":    CallHub.dtmf(String.valueOf(argomento(args, 0))); break;

            // ---- condivisione ------------------------------------------------
            //
            // Tutti e tre finiscono nello stesso posto — il chooser di sistema — e
            // sono l'altra metà di questo passo. Il loro effetto si vede anche fuori
            // dalla condivisione: os.share() (shell/js/os.js:1463-1496) prova il
            // nativo, poi la Web Share API, poi la clipboard, poi una notifica; con
            // `has()` vero per questi comandi la catena si ferma al primo gradino,
            // quindi galleria, note, contatti, registratore e impostazioni passano
            // dal «condividi» della pagina a quello di Android.

            case "shareImage": condividi(argomento(args, 0), "", "Condividi foto"); break;
            case "shareFile":  condividi(argomento(args, 0), argomento(args, 1), "Condividi"); break;
            case "shareText": {
                // Il solo che non passa da un file: nessun permesso da trasferire,
                // nessun provider di mezzo. Porta :app/MainActivity.java:601-606.
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_TEXT, argomento(args, 0));
                apri(Intent.createChooser(send, "Condividi"));
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
                    // Il dialogo si apre al nostro turno, non subito: la shell chiama
                    // questo comando e `getUserMedia` a 40 ms di distanza, e la seconda
                    // richiesta verrebbe rifiutata da Android se la prima fosse ancora
                    // aperta. Vedi unPermessoAllaVolta.
                    unPermessoAllaVolta(() -> requestPermissions(
                            new String[]{Manifest.permission.RECORD_AUDIO}, RICHIESTA_MIC));
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
            case "shellStageBegin": {
                // Fire-and-forget: la shell controlla solo che il comando esista, poi è
                // il primo shellWrite a dire se si può scrivere. Ripulire qui è ciò che
                // rende il commit atomico — senza, i residui di un tentativo fallito
                // (un download a metà) finirebbero nella shell buona.
                try {
                    deleteRecursively(stageDir());
                    if (!stageDir().mkdirs() && !stageDir().isDirectory()) {
                        Log.w(TAG, "staging non creabile: " + stageDir().getAbsolutePath());
                    }
                } catch (Exception e) {
                    Log.w(TAG, "staging non ripulita", e);
                }
                break;
            }
            case "shellWrite": {
                String rel = args.length > 0 ? String.valueOf(args[0]) : null;
                String b64 = args.length > 1 ? String.valueOf(args[1]) : null;
                boolean ok = scriviInStaging(rel, b64);
                if (!ok) Log.w(TAG, "file rifiutato dalla staging: " + rel);
                inviaRisposta(idRichiesta, ok);
                break;
            }
            case "shellCommit": {
                boolean ok = committaStaging();
                // La risposta prima della ricarica, e non è un dettaglio: la shell scrive
                // `done = await shellCommit()` e solo dopo si aspetta di essere ricaricata.
                // Ricaricando mentre la Promise è in volo, il chiamante non riceverebbe mai
                // l'esito — e resterebbe in attesa di un messaggio che la pagina nuova non
                // può ricevere, perché la vecchia non esiste più.
                inviaRisposta(idRichiesta, ok);
                if (ok) {
                    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                        Log.i(TAG, "ricarico la shell dopo il commit");
                        if (session != null) session.reload();
                    }, 400);
                }
                break;
            }
            case "shellReset": {
                // Torna alla shell dell'APK: si cancellano entrambe le cartelle e si
                // ricopia dagli asset. In :app questo ramo caricava la shell online; qui
                // la fonte di verità è l'APK, che è ciò che c'è di sicuro sul dispositivo.
                deleteRecursively(new File(getFilesDir(), "shell"));
                deleteRecursively(stageDir());
                File ripristinata = preparaShell();
                Log.i(TAG, "shell ripristinata dagli asset: " + (ripristinata != null));
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    if (session != null) session.reload();
                }, 200);
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
        File dir = preparaShell();
        if (dir == null) return ASSET_INDEX;
        return "file://" + new File(dir, "index.html").getAbsolutePath();
    }

    /** La cartella di appoggio dell'aggiornamento OTA, prima del commit. */
    private File stageDir() { return new File(getFilesDir(), "shell_stage"); }

    /**
     * Prepara {@code files/shell} e restituisce la cartella, oppure null se non c'è shell.
     *
     * <p><b>Perché non è più una copia incondizionata.</b> Finché la shell era solo quella
     * dell'APK, ricopiarla a ogni avvio era la cosa giusta: si riparte da zero e non
     * restano residui. Con l'OTA diventa un difetto silenzioso — {@code shellCommit}
     * sostituisce {@code files/shell}, e la copia successiva la cancellerebbe, riportando
     * l'interfaccia a quella dell'APK senza dirlo a nessuno. Un aggiornamento che sparisce
     * al riavvio è peggio di uno che fallisce: fallisce in silenzio, e solo dopo.
     *
     * <p>La regola è quella che {@code :app} usa già in {@code resolveShellUrl()}: la shell
     * interna si tiene solo se è più recente di quella negli asset. Il confronto è sulla
     * {@code build} di {@code version.json}, non sulla data dei file — le date di una copia
     * non significano nulla, e dopo un OTA sarebbero comunque «adesso» per entrambe.
     *
     * <p>Una cartella interna senza {@code index.html}, o con un {@code version.json}
     * illeggibile, non è una shell: si ricopia. Il ripiego è sempre l'APK, quindi il caso
     * peggiore di qualunque guasto qui è «si torna alla shell dell'APK», mai «niente shell».
     */
    private File preparaShell() {
        File dir = new File(getFilesDir(), "shell");
        int interna = buildDi(new File(dir, "version.json"));
        int asset = buildDegliAsset();
        if (interna >= 0 && interna > asset && new File(dir, "index.html").isFile()) {
            Log.i(TAG, "shell interna tenuta: build " + interna + " > asset " + asset);
            return dir;
        }
        try {
            deleteRecursively(dir);
            copyAsset(ASSET_SHELL, dir);
            File index = new File(dir, "index.html");
            Log.i(TAG, "shell dagli asset (interna=" + interna + " asset=" + asset + "): "
                    + index.getAbsolutePath() + " eFile=" + index.isFile());
            return index.isFile() ? dir : null;
        } catch (Exception e) {
            Log.e(TAG, "copia in storage interno fallita: ripiego sugli asset", e);
            return null;
        }
    }

    /** La {@code build} dichiarata in un {@code version.json}; -1 se manca o è illeggibile. */
    private int buildDi(File versionJson) {
        try {
            byte[] b = new byte[(int) versionJson.length()];
            try (InputStream in = new FileInputStream(versionJson)) {
                int letti = 0, n;
                while (letti < b.length && (n = in.read(b, letti, b.length - letti)) > 0) letti += n;
            }
            return parseBuild(new String(b, "UTF-8"));
        } catch (Exception e) {
            return -1;
        }
    }

    /** La {@code build} della shell negli asset; -1 se manca o è illeggibile. */
    private int buildDegliAsset() {
        try (InputStream in = getAssets().open(ASSET_SHELL + "/version.json")) {
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return parseBuild(bo.toString("UTF-8"));
        } catch (Exception e) {
            return -1;
        }
    }

    private int parseBuild(String json) {
        try {
            java.util.regex.Matcher m =
                    java.util.regex.Pattern.compile("\"build\"\\s*:\\s*(\\d+)").matcher(json);
            if (m.find()) return Integer.parseInt(m.group(1));
        } catch (Exception ignored) {
            // un version.json malformato non è un errore da propagare: vale -1
        }
        return -1;
    }

    /**
     * Scrive un file nella staging dell'OTA. Rifiuta ogni percorso che esca da
     * {@code shell_stage/}.
     *
     * <p>Stessa logica di {@code :app}: qui arrivano dati <b>dalla rete</b>, quindi il
     * controllo su {@code ..} e sul percorso canonico non è pignoleria. Senza, un
     * {@code ../../shared_prefs/…} scriverebbe fuori dalla staging, cioè dentro i dati
     * privati dell'app.
     */
    private boolean scriviInStaging(String rel, String base64) {
        try {
            if (rel == null || base64 == null) return false;
            rel = rel.replace("\\", "/");
            if (rel.contains("..") || rel.startsWith("/")) return false;
            File out = new File(stageDir(), rel);
            if (!out.getCanonicalPath().startsWith(stageDir().getCanonicalPath())) return false;
            File parent = out.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) return false;
            byte[] dati = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            try (OutputStream fo = new FileOutputStream(out)) {
                fo.write(dati);
            }
            return true;
        } catch (Exception e) {
            Log.w(TAG, "scrittura in staging fallita: " + rel, e);
            return false;
        }
    }

    /**
     * Commit atomico: valida la staging e sostituisce {@code files/shell} con essa.
     *
     * <p>La validazione non è una formalità: {@code index.html} e {@code version.json}
     * devono esserci entrambi. Senza il secondo, al riavvio successivo la build interna
     * risulterebbe {@code -1} e {@link #preparaShell()} ricoprirebbe tutto dagli asset —
     * cioè l'aggiornamento appena installato sparirebbe. Meglio rifiutare qui, quando la
     * shell vecchia è ancora intatta e il chiamante può ripiegare sull'APK.
     *
     * <p>Se {@code renameTo} fallisce dopo che la vecchia cartella è stata cancellata, la
     * shell interna non esiste più: non è un danno permanente, perché al prossimo avvio
     * {@link #preparaShell()} la ricopia dagli asset. Il caso peggiore resta «si torna
     * alla shell dell'APK».
     */
    private boolean committaStaging() {
        File stage = stageDir();
        File dir = new File(getFilesDir(), "shell");
        if (!new File(stage, "index.html").isFile() || !new File(stage, "version.json").isFile()) {
            Log.w(TAG, "commit rifiutato: staging incompleta in " + stage.getAbsolutePath());
            return false;
        }
        deleteRecursively(dir);
        if (!stage.renameTo(dir)) {
            Log.e(TAG, "commit fallito: la staging non è stata spostata in " + dir.getAbsolutePath()
                    + " — al prossimo avvio si riparte dagli asset");
            return false;
        }
        Log.i(TAG, "commit eseguito: shell sostituita, build " + buildDi(new File(dir, "version.json")));
        return true;
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
    /** Ricollega questa Activity a {@link CallHub} a ogni ripresa.
     *
     *  <p>In {@code :app} il collegamento si fa una volta sola in {@code onCreate}, e
     *  basterebbe anche qui — l'Activity è {@code singleTask} e non viene ricreata.
     *  Il motivo per farlo qui è un altro: {@code setActivity} chiama
     *  {@link #pushCall()}, quindi ogni volta che NovaOS torna in primo piano la
     *  schermata di chiamata riceve lo stato corrente. È il caso vero di una chiamata
     *  in corso mentre l'utente è passato da un'altra app: senza, la schermata
     *  resterebbe com'era quando è stata lasciata.
     *
     *  <p>A shell non ancora caricata l'evento non parte e resta nel log come
     *  «nessuna porta nativa aperta»: è il primo avvio, non un guasto. */
    @Override
    protected void onResume() {
        super.onResume();
        CallHub.setActivity(this);
    }

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
