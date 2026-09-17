package os.nova.gecko;

import android.app.Activity;
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

import java.util.List;
import java.util.Map;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Fase 0 della migrazione a GeckoView: carica la shell NovaOS dentro una GeckoSession
 * e verifica che booti identica a oggi.
 *
 * <p>Non implementa il ponte {@code NovaNative}: sotto Gecko la shell deve restare
 * usabile in modalità simulata, ed è esattamente ciò che questo spike verifica.
 *
 * <p>Due origini possibili, scelte dall'extra di intent {@code "origin"}:
 * <ul>
 *   <li>{@code asset} (predefinita) &rarr; {@code resource://android/assets/www/index.html}</li>
 *   <li>{@code internal} &rarr; {@code file://.../files/shell/index.html}, copiata in
 *       storage interno all'avvio</li>
 * </ul>
 *
 * <p>La seconda conta per la fase 2: i content script delle WebExtension non possono
 * agganciare {@code resource://android/assets/*}, quindi il ponte richiederà la shell
 * su {@code file://}. Il percorso {@code asset} dice «Gecko esegue la shell», quello
 * {@code internal} dice se è anche la base giusta per il ponte.
 */
public class MainActivity extends Activity {

    private static final String TAG = "NovaGeckoSpike";

    public static final String ORIGIN_ASSET = "asset";
    public static final String ORIGIN_INTERNAL = "internal";

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

        // Fase 2 — il ponte. Va installata PRIMA di caricare la pagina, perché il
        // content script gira a document_start e bridge.js cattura window.NovaNative
        // una volta sola, mentre si carica.
        installBridgeExtension();

        session = new GeckoSession();
        session.open(runtime);

        view = new GeckoView(this);
        view.setSession(session);
        setContentView(view);

        String uri = ORIGIN_INTERNAL.equals(origin)
                ? copyShellToInternalAndGetUrl()
                : ASSET_INDEX;

        Log.i(TAG, "origine=" + origin + " uri=" + uri);
        session.loadUri(uri);

        immersive();
    }

    /**
     * Fase 2 — installa l'estensione integrata che riespone {@code window.NovaNative}
     * alla pagina e ne riceve i comandi.
     *
     * <p>L'estensione sta negli assets dell'app e Gecko la carica con lo schema
     * {@code resource://android/assets/…}. Attenzione alla distinzione: quello schema è
     * la <i>provenienza dell'estensione</i>, non la pagina che essa aggancia. Il content
     * script aggancia le pagine {@code file://} (vedi {@code assets/extension/content.js}),
     * che è l'origine in cui la shell deve vivere per essere raggiungibile —
     * la conclusione già annotata in {@code docs/MIGRAZIONE-GECKOVIEW.md §9}.
     */
    private void installBridgeExtension() {
        runtime.getWebExtensionController()
                .installBuiltIn("resource://android/assets/extension/")
                .accept(
                        ext -> {
                            ext.setMessageDelegate(new BridgeMessages(), "browser");
                            Log.i(TAG, "estensione del ponte installata: " + ext.id);
                        },
                        e -> Log.e(TAG, "estensione del ponte NON installata", e));
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
            if (message instanceof Map) {
                Map<?, ?> m = (Map<?, ?>) message;
                Object n = m.get("nova");
                if (n != null) nome = String.valueOf(n);
                Object a = m.get("args");
                if (a instanceof Object[]) {
                    args = (Object[]) a;
                } else if (a instanceof List) {
                    args = ((List<?>) a).toArray();
                }
            }
            Log.i(TAG, "comando dal ponte: " + nome + " (" + args.length + " argomenti)");
            if (nome == null) return GeckoResult.fromValue(null);
            final String n2 = nome;
            final Object[] a2 = args;
            runOnUiThread(() -> esegui(n2, a2));
            return GeckoResult.fromValue(null);
        }
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
            default:
                Log.i(TAG, "comando riconosciuto ma non ancora cablato: " + nome);
        }
    }

    /**
     * Copia la shell dagli assets in {@code files/shell} — la stessa disposizione che
     * NovaOS usa già per la shell aggiornata via OTA — e restituisce l'URL {@code file://}.
     */
    private String copyShellToInternalAndGetUrl() {
        try {
            File dir = new File(getFilesDir(), "shell");
            // La copia è integrale: si riparte da zero, altrimenti i residui di un
            // avvio precedente (o di una versione precedente della shell) restano lì.
            deleteRecursively(dir);
            copyAsset(ASSET_SHELL, dir);
            File index = new File(dir, "index.html");
            Log.i(TAG, "shell interna: " + index.getAbsolutePath()
                    + " esiste=" + index.exists() + " eFile=" + index.isFile());
            return "file://" + index.getAbsolutePath();
        } catch (Exception e) {
            Log.e(TAG, "copia in storage interno fallita: ripiego sugli asset", e);
            return ASSET_INDEX;
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
        if (session != null) {
            session.close();
            session = null;
        }
        super.onDestroy();
    }
}
