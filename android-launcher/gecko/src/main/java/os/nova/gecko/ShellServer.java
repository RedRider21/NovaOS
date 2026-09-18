package os.nova.gecko;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

/**
 * Un server HTTP minimo che serve la shell su {@code http://127.0.0.1:PORTA/}.
 *
 * <p><b>Perché serve.</b> Il ponte verso il nativo richiede un content script, e un
 * content script richiede un'origine che Gecko accetti di agganciare. Le due
 * alternative sono entrambe chiuse, per ragioni diverse (verificato il 2026-09-18):
 *
 * <ul>
 *   <li>{@code file://} — da Firefox 153 l'accesso ai file è un permesso separato,
 *       spento anche per le estensioni integrate e non concedibile dall'app;</li>
 *   <li>{@code moz-extension://} — la pagina carica, ma non è un ambiente
 *       privilegiato: {@code sendNativeMessage} da lì non arriva al nativo.</li>
 * </ul>
 *
 * <p>Un'origine {@code http://} locale non ha né l'uno né l'altro problema. In più
 * {@code 127.0.0.1} è considerato «contesto sicuro» dalle specifiche del web, quindi
 * restano disponibili le API che altrove richiedono HTTPS (service worker compreso).
 *
 * <p><b>Ascolto solo su 127.0.0.1</b>: la shell non è raggiungibile dalla rete, e
 * nessun'altra app del telefono può leggerla.
 *
 * <p><b>Porta fissa, non effimera.</b> L'origine di una pagina comprende la porta:
 * cambiandola cambierebbe l'origine, e con essa {@code localStorage} e IndexedDB —
 * cioè tutti i dati della shell. La porta deve restare la stessa a ogni avvio.
 */
public class ShellServer {

    /** Porta fissa: l'origine della shell è {@code http://127.0.0.1:8731}. */
    public static final int PORTA = 8731;

    private static final String TAG = "NovaGeckoServer";

    private final File radice;
    private final int porta;
    private ServerSocket socket;
    private Thread filo;
    private volatile boolean attivo;

    public ShellServer(File radice, int porta) {
        this.radice = radice;
        this.porta = porta;
    }

    /** Avvia il server. Ritorna l'URL della shell, o null se la porta è occupata. */
    public String avvia() {
        try {
            socket = new ServerSocket(porta, 16, InetAddress.getByName("127.0.0.1"));
        } catch (IOException e) {
            android.util.Log.e(TAG, "porta " + porta + " non disponibile", e);
            return null;
        }
        attivo = true;
        filo = new Thread(this::ciclo, "nova-shell-server");
        filo.setDaemon(true);
        filo.start();
        android.util.Log.i(TAG, "server della shell su http://127.0.0.1:" + porta
                + " radice=" + radice.getAbsolutePath());
        return "http://127.0.0.1:" + porta + "/index.html";
    }

    public void ferma() {
        attivo = false;
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // la chiusura è best-effort: il filo è daemon e muore con il processo
        }
    }

    private void ciclo() {
        while (attivo) {
            try (Socket client = socket.accept()) {
                servi(client);
            } catch (IOException e) {
                if (attivo) android.util.Log.w(TAG, "connessione fallita: " + e);
            }
        }
    }

    private void servi(Socket client) throws IOException {
        InputStream in = client.getInputStream();
        String richiesta = leggiRiga(in);
        if (richiesta == null || !richiesta.startsWith("GET ")) return;

        // "GET /css/style.css HTTP/1.1" -> "/css/style.css"
        String percorso = richiesta.split(" ")[1];
        int punto = percorso.indexOf('?');
        if (punto >= 0) percorso = percorso.substring(0, punto);
        percorso = URLDecoder.decode(percorso, "UTF-8");
        if (percorso.endsWith("/")) percorso += "index.html";

        OutputStream out = new BufferedOutputStream(client.getOutputStream());
        File file = risolvi(percorso);
        if (file == null) {
            out.write(("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n"
                    + "Connection: close\r\n\r\n").getBytes("UTF-8"));
            out.flush();
            return;
        }

        byte[] corpo = leggi(file);
        String intestazioni = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: " + tipoDi(file.getName()) + "\r\n"
                + "Content-Length: " + corpo.length + "\r\n"
                // no-store, e non è una precauzione di principio: dopo un commit OTA la
                // shell ricarica chiedendo gli stessi percorsi, con la stessa porta e la
                // stessa origine. Senza questa riga il motore può servirli dalla cache e
                // mostrare l'interfaccia VECCHIA con dentro il version.json nuovo — cioè
                // un aggiornamento che sembra riuscito e non è applicato. Servendo pochi
                // file da disco, la cache qui non guadagna nulla che valga il rischio.
                + "Cache-Control: no-store\r\n"
                + // senza questo il browser tiene la connessione aperta e il filo resta occupato
                "Connection: close\r\n\r\n";
        out.write(intestazioni.getBytes("UTF-8"));
        out.write(corpo);
        out.flush();
    }

    /**
     * Traduce un percorso della richiesta in un file dentro la radice.
     *
     * <p>Il controllo su {@code ..} non è pignoleria: senza, una richiesta come
     * {@code /../../shared_prefs/...} uscirebbe dalla cartella della shell e
     * leggerebbe qualunque file dell'app.
     */
    private File risolvi(String percorso) throws IOException {
        String relativo = percorso.startsWith("/") ? percorso.substring(1) : percorso;
        File candidato = new File(radice, relativo);
        if (!candidato.getCanonicalPath().startsWith(radice.getCanonicalPath())) return null;
        if (candidato.isDirectory()) candidato = new File(candidato, "index.html");
        return candidato.isFile() ? candidato : null;
    }

    private static String leggiRiga(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') sb.append((char) c);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    private static byte[] leggi(File f) throws IOException {
        byte[] buf = new byte[(int) f.length()];
        try (InputStream in = new FileInputStream(f)) {
            int letti = 0;
            while (letti < buf.length) {
                int n = in.read(buf, letti, buf.length - letti);
                if (n < 0) break;
                letti += n;
            }
        }
        return buf;
    }

    private static final Map<String, String> TIPI = new HashMap<>();
    static {
        TIPI.put("html", "text/html; charset=utf-8");
        TIPI.put("js", "text/javascript; charset=utf-8");
        TIPI.put("mjs", "text/javascript; charset=utf-8");
        TIPI.put("css", "text/css; charset=utf-8");
        TIPI.put("json", "application/json; charset=utf-8");
        TIPI.put("webmanifest", "application/manifest+json; charset=utf-8");
        TIPI.put("svg", "image/svg+xml");
        TIPI.put("png", "image/png");
        TIPI.put("jpg", "image/jpeg");
        TIPI.put("jpeg", "image/jpeg");
        TIPI.put("gif", "image/gif");
        TIPI.put("webp", "image/webp");
        TIPI.put("ico", "image/x-icon");
        TIPI.put("woff", "font/woff");
        TIPI.put("woff2", "font/woff2");
        TIPI.put("ttf", "font/ttf");
        TIPI.put("mp3", "audio/mpeg");
        TIPI.put("mp4", "video/mp4");
        TIPI.put("txt", "text/plain; charset=utf-8");
    }

    private static String tipoDi(String nome) {
        int punto = nome.lastIndexOf('.');
        if (punto < 0) return "application/octet-stream";
        String tipo = TIPI.get(nome.substring(punto + 1).toLowerCase());
        return tipo != null ? tipo : "application/octet-stream";
    }
}
