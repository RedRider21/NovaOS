package os.nova.launcher;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;

/**
 * Provider minimale per condividere file dalla cache dell'app tramite content://.
 * Serve perché da Android 7 non si possono passare file:// ad altre app
 * (FileUriExposedException) e nella build senza Gradle non abbiamo androidx FileProvider.
 * I file vivono in cacheDir/share e vengono esposti in sola lettura.
 */
public class ShareProvider extends ContentProvider {

    public static final String AUTHORITY = "os.nova.launcher.share";

    private File fileFor(Uri uri) {
        return new File(new File(getContext().getCacheDir(), "share"), uri.getLastPathSegment());
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) {
        try { return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY); }
        catch (Exception e) { return null; }
    }

    /**
     * Il tipo dichiarato del file. <b>Deve</b> corrispondere al contenuto: è quello che
     * l'app di destinazione crede, e una bugia qui è invisibile da entrambe le parti.
     * (Il caso vero: un filmato scritto con nome {@code .jpg} veniva annunciato come
     * {@code image/jpeg}, e all'altro capo arrivava «una jpeg grande quanto il filmato».)
     *
     * <p>Se l'estensione non è fra quelle note si ripiega su {@code octet-stream}, che è
     * l'onesto «non lo so»: meglio di un tipo sbagliato.
     */
    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n == null) return "application/octet-stream";
        String nome = n.toLowerCase(java.util.Locale.ROOT);
        if (nome.endsWith(".png"))  return "image/png";
        if (nome.endsWith(".jpg") || nome.endsWith(".jpeg")) return "image/jpeg";
        if (nome.endsWith(".webp")) return "image/webp";
        if (nome.endsWith(".gif"))  return "image/gif";
        if (nome.endsWith(".mp4") || nome.endsWith(".m4v")) return "video/mp4";
        if (nome.endsWith(".webm")) return "video/webm";
        if (nome.endsWith(".3gp"))  return "video/3gpp";
        if (nome.endsWith(".m4a") || nome.endsWith(".aac")) return "audio/mp4";
        if (nome.endsWith(".mp3"))  return "audio/mpeg";
        if (nome.endsWith(".ogg") || nome.endsWith(".oga")) return "audio/ogg";
        if (nome.endsWith(".wav"))  return "audio/wav";
        if (nome.endsWith(".pdf"))  return "application/pdf";
        if (nome.endsWith(".json")) return "application/json";
        if (nome.endsWith(".txt"))  return "text/plain";
        return "application/octet-stream";
    }

    /** Espone nome e dimensione (OpenableColumns): alcune app le richiedono per l'anteprima. */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f = fileFor(uri);
        String[] cols = { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        MatrixCursor c = new MatrixCursor(cols, 1);
        c.addRow(new Object[]{ f.getName(), f.length() });
        return c;
    }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
