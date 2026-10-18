/*
 * SPDX-License-Identifier: MIT
 * Copyright (C) 2026 RedRider21
 *
 * Sorgente recuperato per decompilazione (CFR 0.152) dal build Gecko del
 * 2026-09-25, dopo la perdita dei sorgenti originali. Tenere presente che
 * commenti e nomi di alcune variabili locali possono essere andati persi.
 */
package os.nova.gecko;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.util.Base64;
import java.security.Key;
import java.security.KeyStore;
import java.security.spec.AlgorithmParameterSpec;
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
import javax.mail.BodyPart;
import javax.mail.Flags;
import javax.mail.Folder;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.Part;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Store;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;
import org.json.JSONArray;
import org.json.JSONObject;

public class MailBridge {
    private static final String KEY_ALIAS = "nova_mail_key";
    private static final String PREFS = "nova_mail";
    private final Context ctx;
    private final Sink sink;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    public MailBridge(Context c, Sink s) {
        this.ctx = c;
        this.sink = s;
    }

    private SharedPreferences prefs() {
        return this.ctx.getSharedPreferences(PREFS, 0);
    }

    public void configure(String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences.Editor e = this.prefs().edit();
            e.putString("name", o.optString("name"));
            e.putString("email", o.optString("email"));
            e.putString("imapHost", o.optString("imapHost"));
            e.putInt("imapPort", o.optInt("imapPort", 993));
            e.putString("smtpHost", o.optString("smtpHost"));
            e.putInt("smtpPort", o.optInt("smtpPort", 465));
            e.putString("user", o.optString("user", o.optString("email")));
            String pw = o.optString("password", "");
            if (pw.length() > 0) {
                e.putString("pw", this.encrypt(pw));
            }
            e.apply();
        }
        catch (Exception exception) {
            // empty catch block
        }
    }

    public String account() {
        SharedPreferences p = this.prefs();
        try {
            JSONObject o = new JSONObject();
            o.put("name", (Object)p.getString("name", ""));
            o.put("email", (Object)p.getString("email", ""));
            o.put("imapHost", (Object)p.getString("imapHost", ""));
            o.put("imapPort", p.getInt("imapPort", 993));
            o.put("smtpHost", (Object)p.getString("smtpHost", ""));
            o.put("smtpPort", p.getInt("smtpPort", 465));
            o.put("user", (Object)p.getString("user", ""));
            o.put("hasPassword", p.contains("pw"));
            o.put("configured", p.contains("pw") && p.getString("imapHost", "").length() > 0 && p.getString("smtpHost", "").length() > 0);
            return o.toString();
        }
        catch (Exception e) {
            return "{}";
        }
    }

    public void clear() {
        this.prefs().edit().clear().apply();
    }

    public void send(String json) {
        this.io.execute(() -> {
            try {
                JSONObject o = new JSONObject(json);
                SharedPreferences p = this.prefs();
                int port = p.getInt("smtpPort", 465);
                Properties props = new Properties();
                props.put("mail.smtp.host", p.getString("smtpHost", ""));
                props.put("mail.smtp.port", String.valueOf(port));
                props.put("mail.smtp.auth", "true");
                if (port == 465) {
                    props.put("mail.smtp.ssl.enable", "true");
                } else {
                    props.put("mail.smtp.starttls.enable", "true");
                }
                props.put("mail.smtp.connectiontimeout", "20000");
                props.put("mail.smtp.timeout", "30000");
                final String user = p.getString("user", "");
                final String pw = this.decrypt(p.getString("pw", ""));
                Session session = Session.getInstance((Properties)props, (Authenticator)new Authenticator(){

                    protected PasswordAuthentication getPasswordAuthentication() {
                        return new PasswordAuthentication(user, pw);
                    }
                });
                MimeMessage msg = new MimeMessage(session);
                msg.setFrom((Address)new InternetAddress(p.getString("email", user), p.getString("name", ""), "UTF-8"));
                for (String to : o.getString("to").split("[,;\\s]+")) {
                    if (to.trim().length() <= 0) continue;
                    msg.addRecipient(Message.RecipientType.TO, (Address)new InternetAddress(to.trim()));
                }
                msg.setSubject(o.optString("subj", ""), "UTF-8");
                msg.setText(o.optString("body", ""), "UTF-8");
                Transport.send((Message)msg);
                this.sink.evento("mail.onSent", true, "");
            }
            catch (Exception ex) {
                this.sink.evento("mail.onSent", false, ex.getMessage() == null ? "" : ex.getMessage());
            }
        });
    }

    public void fetch(String folder, int limit) {
        this.io.execute(() -> {
            Store store = null;
            Folder fol = null;
            try {
                SharedPreferences p = this.prefs();
                Properties props = new Properties();
                props.put("mail.store.protocol", "imaps");
                props.put("mail.imaps.connectiontimeout", "20000");
                props.put("mail.imaps.timeout", "30000");
                Session session = Session.getInstance((Properties)props);
                store = session.getStore("imaps");
                store.connect(p.getString("imapHost", ""), p.getInt("imapPort", 993), p.getString("user", ""), this.decrypt(p.getString("pw", "")));
                fol = store.getFolder(folder == null || folder.isEmpty() ? "INBOX" : folder);
                fol.open(1);
                int total = fol.getMessageCount();
                int from = Math.max(1, total - limit + 1);
                Message[] msgs = total > 0 ? fol.getMessages(from, total) : new Message[]{};
                SimpleDateFormat fmt = new SimpleDateFormat("dd/MM HH:mm", Locale.ITALY);
                JSONArray arr = new JSONArray();
                for (int i = msgs.length - 1; i >= 0; --i) {
                    Message m = msgs[i];
                    JSONObject o = new JSONObject();
                    Address[] fr = m.getFrom();
                    o.put("from", (Object)(fr != null && fr.length > 0 ? fr[0].toString() : "(sconosciuto)"));
                    o.put("subj", (Object)(m.getSubject() != null ? m.getSubject() : "(nessun oggetto)"));
                    o.put("time", (Object)(m.getSentDate() != null ? fmt.format(m.getSentDate()) : ""));
                    o.put("body", (Object)MailBridge.extractText((Part)m));
                    o.put("read", m.isSet(Flags.Flag.SEEN));
                    o.put("uid", (Object)("s" + m.getMessageNumber()));
                    arr.put((Object)o);
                }
                this.sink.evento("mail.onMessages", folder == null ? "" : folder, arr.toString());
            }
            catch (Exception ex) {
                this.sink.evento("mail.onError", ex.getMessage() == null ? "" : ex.getMessage());
            }
            finally {
                try {
                    if (fol != null && fol.isOpen()) {
                        fol.close(false);
                    }
                }
                catch (Exception exception) {}
                try {
                    if (store != null) {
                        store.close();
                    }
                }
                catch (Exception exception) {}
            }
        });
    }

    private static String extractText(Part part) {
        try {
            if (part.isMimeType("text/plain")) {
                return String.valueOf(part.getContent());
            }
            if (part.isMimeType("text/html")) {
                String html = String.valueOf(part.getContent());
                return html.replaceAll("(?s)<[^>]*>", " ").replaceAll("&nbsp;", " ").replaceAll("[ \\t]+", " ").trim();
            }
            if (part.isMimeType("multipart/*")) {
                Multipart mp = (Multipart)part.getContent();
                String htmlFallback = null;
                for (int i = 0; i < mp.getCount(); ++i) {
                    String t;
                    BodyPart bp = mp.getBodyPart(i);
                    if (bp.isMimeType("text/plain")) {
                        return String.valueOf(bp.getContent());
                    }
                    if (bp.isMimeType("multipart/*") && (t = MailBridge.extractText((Part)bp)).length() > 0) {
                        return t;
                    }
                    if (!bp.isMimeType("text/html") || htmlFallback != null) continue;
                    htmlFallback = MailBridge.extractText((Part)bp);
                }
                if (htmlFallback != null) {
                    return htmlFallback;
                }
            }
        }
        catch (Exception exception) {
            // empty catch block
        }
        return "";
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry)ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator kg = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        kg.init((AlgorithmParameterSpec)new KeyGenParameterSpec.Builder(KEY_ALIAS, 3).setBlockModes(new String[]{"GCM"}).setEncryptionPaddings(new String[]{"NoPadding"}).build());
        return kg.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(1, this.getOrCreateKey());
        byte[] iv = c.getIV();
        byte[] ct = c.doFinal(plain.getBytes("UTF-8"));
        return Base64.encodeToString((byte[])iv, (int)2) + ":" + Base64.encodeToString((byte[])ct, (int)2);
    }

    private String decrypt(String stored) throws Exception {
        if (stored == null || !stored.contains(":")) {
            return "";
        }
        String[] parts = stored.split(":", 2);
        byte[] iv = Base64.decode((String)parts[0], (int)2);
        byte[] ct = Base64.decode((String)parts[1], (int)2);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(2, (Key)this.getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(c.doFinal(ct), "UTF-8");
    }

    public static interface Sink {
        public void evento(String var1, Object ... var2);
    }
}

