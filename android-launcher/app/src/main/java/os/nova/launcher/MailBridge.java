package os.nova.launcher;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.mail.Address;
import javax.mail.Authenticator;
import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.PasswordAuthentication;
import javax.mail.Part;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

/**
 * Ponte email reale per NovaOS: invia via SMTP e scarica via IMAP usando
 * JavaMail (porting Android). Tutto il lavoro di rete gira su un thread I/O;
 * i risultati tornano alla web shell chiamando window.NovaMail.*.
 *
 * La password non viene mai salvata in chiaro: è cifrata con una chiave AES/GCM
 * custodita nell'Android Keystore e conservata (solo il cifrato) nei
 * SharedPreferences privati dell'app.
 */
public class MailBridge {

    /** Sink verso la WebView: esegue JS sul thread UI. */
    public interface JsSink { void eval(String js); }

    private static final String KEY_ALIAS = "nova_mail_key";
    private static final String PREFS = "nova_mail";

    private final Context ctx;
    private final JsSink sink;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    public MailBridge(Context c, JsSink s) { ctx = c; sink = s; }

    private SharedPreferences prefs() { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static String jsStr(String s) { return JSONObject.quote(s == null ? "" : s); }

    // ---------------- configurazione account ----------------

    /** Salva l'account. La password (se presente) viene cifrata nel Keystore. */
    public void configure(String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences.Editor e = prefs().edit();
            e.putString("name", o.optString("name"));
            e.putString("email", o.optString("email"));
            e.putString("imapHost", o.optString("imapHost"));
            e.putInt("imapPort", o.optInt("imapPort", 993));
            e.putString("smtpHost", o.optString("smtpHost"));
            e.putInt("smtpPort", o.optInt("smtpPort", 465));
            e.putString("user", o.optString("user", o.optString("email")));
            String pw = o.optString("password", "");
            if (pw.length() > 0) e.putString("pw", encrypt(pw));   // solo se l'utente l'ha (ri)digitata
            e.apply();
        } catch (Exception ignored) {}
    }

    /** Info NON segrete dell'account, per la schermata impostazioni. */
    public String account() {
        SharedPreferences p = prefs();
        try {
            JSONObject o = new JSONObject();
            o.put("name", p.getString("name", ""));
            o.put("email", p.getString("email", ""));
            o.put("imapHost", p.getString("imapHost", ""));
            o.put("imapPort", p.getInt("imapPort", 993));
            o.put("smtpHost", p.getString("smtpHost", ""));
            o.put("smtpPort", p.getInt("smtpPort", 465));
            o.put("user", p.getString("user", ""));
            o.put("hasPassword", p.contains("pw"));
            o.put("configured", p.contains("pw") && p.getString("imapHost", "").length() > 0 && p.getString("smtpHost", "").length() > 0);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    public void clear() { prefs().edit().clear().apply(); }

    // ---------------- invio (SMTP) ----------------

    public void send(String json) {
        io.execute(() -> {
            try {
                JSONObject o = new JSONObject(json);
                SharedPreferences p = prefs();
                int port = p.getInt("smtpPort", 465);
                Properties props = new Properties();
                props.put("mail.smtp.host", p.getString("smtpHost", ""));
                props.put("mail.smtp.port", String.valueOf(port));
                props.put("mail.smtp.auth", "true");
                if (port == 465) props.put("mail.smtp.ssl.enable", "true");
                else props.put("mail.smtp.starttls.enable", "true");
                props.put("mail.smtp.connectiontimeout", "20000");
                props.put("mail.smtp.timeout", "30000");

                final String user = p.getString("user", "");
                final String pw = decrypt(p.getString("pw", ""));
                Session session = Session.getInstance(props, new Authenticator() {
                    protected PasswordAuthentication getPasswordAuthentication() {
                        return new PasswordAuthentication(user, pw);
                    }
                });
                MimeMessage msg = new MimeMessage(session);
                msg.setFrom(new InternetAddress(p.getString("email", user), p.getString("name", ""), "UTF-8"));
                for (String to : o.getString("to").split("[,;\\s]+"))
                    if (to.trim().length() > 0) msg.addRecipient(Message.RecipientType.TO, new InternetAddress(to.trim()));
                msg.setSubject(o.optString("subj", ""), "UTF-8");
                msg.setText(o.optString("body", ""), "UTF-8");
                Transport.send(msg);
                sink.eval("window.NovaMail&&NovaMail.onSent(true,'')");
            } catch (Exception ex) {
                sink.eval("window.NovaMail&&NovaMail.onSent(false," + jsStr(ex.getMessage()) + ")");
            }
        });
    }

    // ---------------- ricezione (IMAP) ----------------

    public void fetch(String folder, int limit) {
        io.execute(() -> {
            Store store = null; Folder fol = null;
            try {
                SharedPreferences p = prefs();
                Properties props = new Properties();
                props.put("mail.store.protocol", "imaps");
                props.put("mail.imaps.connectiontimeout", "20000");
                props.put("mail.imaps.timeout", "30000");
                Session session = Session.getInstance(props);
                store = session.getStore("imaps");
                store.connect(p.getString("imapHost", ""), p.getInt("imapPort", 993),
                        p.getString("user", ""), decrypt(p.getString("pw", "")));
                fol = store.getFolder((folder == null || folder.isEmpty()) ? "INBOX" : folder);
                fol.open(Folder.READ_ONLY);
                int total = fol.getMessageCount();
                int from = Math.max(1, total - limit + 1);
                Message[] msgs = total > 0 ? fol.getMessages(from, total) : new Message[0];
                SimpleDateFormat fmt = new SimpleDateFormat("dd/MM HH:mm", Locale.ITALY);
                JSONArray arr = new JSONArray();
                for (int i = msgs.length - 1; i >= 0; i--) {   // dal più recente
                    Message m = msgs[i];
                    JSONObject o = new JSONObject();
                    Address[] fr = m.getFrom();
                    o.put("from", (fr != null && fr.length > 0) ? fr[0].toString() : "(sconosciuto)");
                    o.put("subj", m.getSubject() != null ? m.getSubject() : "(nessun oggetto)");
                    o.put("time", m.getSentDate() != null ? fmt.format(m.getSentDate()) : "");
                    o.put("body", extractText(m));
                    o.put("read", m.isSet(Flags.Flag.SEEN));
                    o.put("uid", "s" + m.getMessageNumber());
                    arr.put(o);
                }
                sink.eval("window.NovaMail&&NovaMail.onMessages(" + jsStr(folder) + "," + jsStr(arr.toString()) + ")");
            } catch (Exception ex) {
                sink.eval("window.NovaMail&&NovaMail.onError(" + jsStr(ex.getMessage()) + ")");
            } finally {
                try { if (fol != null && fol.isOpen()) fol.close(false); } catch (Exception ignored) {}
                try { if (store != null) store.close(); } catch (Exception ignored) {}
            }
        });
    }

    /** Estrae il testo leggibile da un messaggio (gestisce multipart, preferisce text/plain). */
    private static String extractText(Part part) {
        try {
            if (part.isMimeType("text/plain")) return String.valueOf(part.getContent());
            if (part.isMimeType("text/html")) {
                String html = String.valueOf(part.getContent());
                return html.replaceAll("(?s)<[^>]*>", " ").replaceAll("&nbsp;", " ").replaceAll("[ \\t]+", " ").trim();
            }
            if (part.isMimeType("multipart/*")) {
                Multipart mp = (Multipart) part.getContent();
                String htmlFallback = null;
                for (int i = 0; i < mp.getCount(); i++) {
                    Part bp = mp.getBodyPart(i);
                    if (bp.isMimeType("text/plain")) return String.valueOf(bp.getContent());
                    if (bp.isMimeType("multipart/*")) { String t = extractText(bp); if (t.length() > 0) return t; }
                    if (bp.isMimeType("text/html") && htmlFallback == null) htmlFallback = extractText(bp);
                }
                if (htmlFallback != null) return htmlFallback;
            }
        } catch (Exception ignored) {}
        return "";
    }

    // ---------------- cifratura password (Android Keystore, AES/GCM) ----------------

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return kg.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = c.getIV();
        byte[] ct = c.doFinal(plain.getBytes("UTF-8"));
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
    }

    private String decrypt(String stored) throws Exception {
        if (stored == null || !stored.contains(":")) return "";
        String[] parts = stored.split(":", 2);
        byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
        byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(c.doFinal(ct), "UTF-8");
    }
}
