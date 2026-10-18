/*
 * SPDX-License-Identifier: MIT
 * Copyright (C) 2026 RedRider21
 *
 * Sorgente recuperato per decompilazione (CFR 0.152) dal build Gecko del
 * 2026-09-25, dopo la perdita dei sorgenti originali. Tenere presente che
 * commenti e nomi di alcune variabili locali possono essere andati persi.
 */
package os.nova.gecko;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.util.Locale;

public class ShareProvider
extends ContentProvider {
    public static final String AUTHORITY = "os.nova.gecko.share";

    private File fileFor(Uri uri) {
        return new File(new File(this.getContext().getCacheDir(), "share"), uri.getLastPathSegment());
    }

    public boolean onCreate() {
        return true;
    }

    public ParcelFileDescriptor openFile(Uri uri, String mode) {
        try {
            return ParcelFileDescriptor.open((File)this.fileFor(uri), (int)0x10000000);
        }
        catch (Exception e) {
            return null;
        }
    }

    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n == null) {
            return "application/octet-stream";
        }
        String nome = n.toLowerCase(Locale.ROOT);
        if (nome.endsWith(".png")) {
            return "image/png";
        }
        if (nome.endsWith(".jpg") || nome.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (nome.endsWith(".webp")) {
            return "image/webp";
        }
        if (nome.endsWith(".gif")) {
            return "image/gif";
        }
        if (nome.endsWith(".mp4") || nome.endsWith(".m4v")) {
            return "video/mp4";
        }
        if (nome.endsWith(".webm")) {
            return "video/webm";
        }
        if (nome.endsWith(".3gp")) {
            return "video/3gpp";
        }
        if (nome.endsWith(".m4a") || nome.endsWith(".aac")) {
            return "audio/mp4";
        }
        if (nome.endsWith(".mp3")) {
            return "audio/mpeg";
        }
        if (nome.endsWith(".ogg") || nome.endsWith(".oga")) {
            return "audio/ogg";
        }
        if (nome.endsWith(".wav")) {
            return "audio/wav";
        }
        if (nome.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (nome.endsWith(".json")) {
            return "application/json";
        }
        if (nome.endsWith(".txt")) {
            return "text/plain";
        }
        return "application/octet-stream";
    }

    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f = this.fileFor(uri);
        String[] cols = new String[]{"_display_name", "_size"};
        MatrixCursor c = new MatrixCursor(cols, 1);
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    public Uri insert(Uri uri, ContentValues v) {
        return null;
    }

    public int delete(Uri uri, String s, String[] a) {
        return 0;
    }

    public int update(Uri uri, ContentValues v, String s, String[] a) {
        return 0;
    }
}

