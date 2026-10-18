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
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import org.mozilla.geckoview.ContentBlocking;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.WebExtension;

public final class MotoreGecko {
    private static final String TAG = "NovaGeckoSpike";
    private static final String ESTENSIONE_PONTE = "resource://android/assets/extension/";
    private static GeckoRuntime motore;
    private static WebExtension ponte;
    private static Throwable ponteFallito;
    private static boolean installazioneInCorso;
    private static final List<AlPonte> inAttesa;

    private MotoreGecko() {
    }

    public static synchronized GeckoRuntime get(Context contesto) {
        if (motore != null) {
            return motore;
        }
        Context app = contesto.getApplicationContext();
        motore = GeckoRuntime.create((Context)app, (GeckoRuntimeSettings)MotoreGecko.impostazioni(app));
        Log.i((String)TAG, (String)"motore Gecko creato (uno per processo: da qui in poi si riusa)");
        return motore;
    }

    private static GeckoRuntimeSettings impostazioni(Context app) {
        ContentBlocking.Settings blocco = (ContentBlocking.Settings)new ContentBlocking.Settings.Builder().cookieBehavior(0).cookieBehaviorPrivateMode(0).build();
        return (GeckoRuntimeSettings)new GeckoRuntimeSettings.Builder().consoleOutput(true).contentBlocking(blocco).preferredColorScheme(MotoreGecko.schemaDelTema(app)).build();
    }

    public static int schemaDelTema(Context contesto) {
        String tema = contesto.getSharedPreferences("novaos", 0).getString("nova:theme", "\"dark\"");
        return tema != null && tema.contains("light") ? 0 : 1;
    }

    public static void aggiornaTema(Context contesto) {
        GeckoRuntime m = motore;
        if (m == null) {
            return;
        }
        try {
            m.getSettings().setPreferredColorScheme(MotoreGecko.schemaDelTema(contesto));
        }
        catch (Exception e) {
            Log.w((String)TAG, (String)"tema non applicato al motore", (Throwable)e);
        }
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    public static void alPonte(AlPonte azione) {
        boolean avviare = false;
        Class<MotoreGecko> clazz = MotoreGecko.class;
        synchronized (MotoreGecko.class) {
            WebExtension pronto = ponte;
            Throwable guasto = ponteFallito;
            if (pronto == null && guasto == null) {
                inAttesa.add(azione);
                if (!installazioneInCorso) {
                    installazioneInCorso = true;
                    avviare = true;
                }
            }
            // ** MonitorExit[var4_2] (shouldn't be in output)
            if (pronto != null) {
                WebExtension e = pronto;
                MotoreGecko.sulThreadPrincipale(() -> azione.pronto(e));
            } else if (guasto != null) {
                Throwable g = guasto;
                MotoreGecko.sulThreadPrincipale(() -> azione.assente(g));
            } else if (avviare) {
                MotoreGecko.installa();
            }
            return;
        }
    }

    private static void installa() {
        GeckoRuntime m = motore;
        if (m == null) {
            MotoreGecko.concludi(null, new IllegalStateException("installazione del ponte richiesta senza motore: manca MotoreGecko.get()"));
            return;
        }
        m.getWebExtensionController().installBuiltIn(ESTENSIONE_PONTE).accept(MotoreGecko::pontePronto, MotoreGecko::ponteAssente);
    }

    private static void pontePronto(WebExtension estensione) {
        WebExtension.MetaData md = estensione.metaData;
        Log.i((String)TAG, (String)("estensione del ponte pronta: " + estensione.id + " enabled=" + md.enabled + " disabledFlags=" + md.disabledFlags));
        MotoreGecko.concludi(estensione, null);
    }

    private static void ponteAssente(Throwable errore) {
        Log.e((String)TAG, (String)"estensione del ponte NON installata: si prosegue senza", (Throwable)errore);
        MotoreGecko.concludi(null, errore);
    }

    /*
     * WARNING - Removed try catching itself - possible behaviour change.
     */
    private static void concludi(WebExtension estensione, Throwable errore) {
        Class<MotoreGecko> clazz = MotoreGecko.class;
        synchronized (MotoreGecko.class) {
            ponte = estensione;
            ponteFallito = errore;
            installazioneInCorso = false;
            ArrayList<AlPonte> coda = new ArrayList<AlPonte>(inAttesa);
            inAttesa.clear();
            // ** MonitorExit[var3_2] (shouldn't be in output)
            Log.i((String)TAG, (String)("esito del ponte comunicato a " + coda.size() + " azioni in attesa"));
            MotoreGecko.sulThreadPrincipale(() -> {
                for (AlPonte a : coda) {
                    if (estensione != null) {
                        a.pronto(estensione);
                        continue;
                    }
                    a.assente(errore);
                }
            });
            return;
        }
    }

    private static void sulThreadPrincipale(Runnable azione) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            azione.run();
        } else {
            new Handler(Looper.getMainLooper()).post(azione);
        }
    }

    static {
        inAttesa = new ArrayList<AlPonte>();
    }

    public static interface AlPonte {
        public void pronto(WebExtension var1);

        public void assente(Throwable var1);
    }
}

