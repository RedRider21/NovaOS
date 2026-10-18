/*
 * SPDX-License-Identifier: MIT
 * Copyright (C) 2026 RedRider21
 *
 * Sorgente recuperato per decompilazione (CFR 0.152) dal build Gecko del
 * 2026-09-25, dopo la perdita dei sorgenti originali. Tenere presente che
 * commenti e nomi di alcune variabili locali possono essere andati persi.
 */
package os.nova.gecko;

import android.util.Log;
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

public class ShellServer {
    public static final int PORTA = 8731;
    private static final String TAG = "NovaGeckoServer";
    private final File radice;
    private final int porta;
    private ServerSocket socket;
    private Thread filo;
    private volatile boolean attivo;
    private static final Map<String, String> TIPI = new HashMap<String, String>();

    public ShellServer(File radice, int porta) {
        this.radice = radice;
        this.porta = porta;
    }

    public String avvia() {
        try {
            this.socket = new ServerSocket(this.porta, 16, InetAddress.getByName("127.0.0.1"));
        }
        catch (IOException e) {
            Log.e((String)TAG, (String)("porta " + this.porta + " non disponibile"), (Throwable)e);
            return null;
        }
        this.attivo = true;
        this.filo = new Thread(this::ciclo, "nova-shell-server");
        this.filo.setDaemon(true);
        this.filo.start();
        Log.i((String)TAG, (String)("server della shell su http://127.0.0.1:" + this.porta + " radice=" + this.radice.getAbsolutePath()));
        return "http://127.0.0.1:" + this.porta + "/index.html";
    }

    public void ferma() {
        this.attivo = false;
        try {
            if (this.socket != null) {
                this.socket.close();
            }
        }
        catch (IOException iOException) {
            // empty catch block
        }
    }

    private void ciclo() {
        while (this.attivo) {
            try {
                Socket client = this.socket.accept();
                try {
                    this.servi(client);
                }
                finally {
                    if (client == null) continue;
                    client.close();
                }
            }
            catch (IOException e) {
                if (!this.attivo) continue;
                Log.w((String)TAG, (String)("connessione fallita: " + e));
            }
        }
    }

    private void servi(Socket client) throws IOException {
        InputStream in = client.getInputStream();
        String richiesta = ShellServer.leggiRiga(in);
        if (richiesta == null || !richiesta.startsWith("GET ")) {
            return;
        }
        String percorso = richiesta.split(" ")[1];
        int punto = percorso.indexOf(63);
        if (punto >= 0) {
            percorso = percorso.substring(0, punto);
        }
        if ((percorso = URLDecoder.decode(percorso, "UTF-8")).endsWith("/")) {
            percorso = percorso + "index.html";
        }
        BufferedOutputStream out = new BufferedOutputStream(client.getOutputStream());
        File file = this.risolvi(percorso);
        if (file == null) {
            ((OutputStream)out).write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes("UTF-8"));
            ((OutputStream)out).flush();
            return;
        }
        byte[] corpo = ShellServer.leggi(file);
        String intestazioni = "HTTP/1.1 200 OK\r\nContent-Type: " + ShellServer.tipoDi(file.getName()) + "\r\nContent-Length: " + corpo.length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        ((OutputStream)out).write(intestazioni.getBytes("UTF-8"));
        ((OutputStream)out).write(corpo);
        ((OutputStream)out).flush();
    }

    private File risolvi(String percorso) throws IOException {
        String relativo = percorso.startsWith("/") ? percorso.substring(1) : percorso;
        File candidato = new File(this.radice, relativo);
        if (!candidato.getCanonicalPath().startsWith(this.radice.getCanonicalPath())) {
            return null;
        }
        if (candidato.isDirectory()) {
            candidato = new File(candidato, "index.html");
        }
        return candidato.isFile() ? candidato : null;
    }

    private static String leggiRiga(InputStream in) throws IOException {
        int c;
        StringBuilder sb = new StringBuilder();
        while ((c = in.read()) != -1 && c != 10) {
            if (c == 13) continue;
            sb.append((char)c);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    private static byte[] leggi(File f) throws IOException {
        byte[] buf = new byte[(int)f.length()];
        try (FileInputStream in = new FileInputStream(f);){
            int n;
            for (int letti = 0; letti < buf.length; letti += n) {
                n = ((InputStream)in).read(buf, letti, buf.length - letti);
                if (n >= 0) continue;
                break;
            }
        }
        return buf;
    }

    private static String tipoDi(String nome) {
        int punto = nome.lastIndexOf(46);
        if (punto < 0) {
            return "application/octet-stream";
        }
        String tipo = TIPI.get(nome.substring(punto + 1).toLowerCase());
        return tipo != null ? tipo : "application/octet-stream";
    }

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
}

