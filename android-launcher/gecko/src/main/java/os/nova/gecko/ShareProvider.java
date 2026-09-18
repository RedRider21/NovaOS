package os.nova.gecko;

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
 *
 * <p>Porta da {@code :app/…/ShareProvider.java}: cambia il package e l'autorità —
 * {@code os.nova.launcher.share} → {@code os.nova.gecko.share} — perché l'autorità
 * è unica per dispositivo: due app che dichiarano la stessa non convivono, e
 * l'installazione della seconda fallirebbe con {@code INSTALL_FAILED_CONFLICTING_PROVIDER}.
 * La costante qui e la voce {@code <provider>} nel manifest devono restare identiche
 * <b>carattere per carattere</b>: se divergono, il sistema non trova il provider e
 * {@link #openFile} non viene mai chiamato — l'app che riceve l'URI lo apre e non ci
 * trova niente, senza un errore che spieghi perché.
 */
public class ShareProvider extends ContentProvider {

    public static final String AUTHORITY = "os.nova.gecko.share";

    private File fileFor(Uri uri) {
        return new File(new File(getContext().getCacheDir(), "share"), uri.getLastPathSegment());
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) {
        try { return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY); }
        catch (Exception e) { return null; }
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n == null) return "application/octet-stream";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
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
