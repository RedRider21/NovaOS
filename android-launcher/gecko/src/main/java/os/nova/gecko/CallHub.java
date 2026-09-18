package os.nova.gecko;

import android.telecom.Call;
import android.telecom.CallAudioState;

/**
 * Ponte statico tra l'InCallService (che riceve gli eventi di chiamata dal
 * sistema) e la MainActivity (che mostra la schermata di chiamata dentro
 * NovaOS). Tiene la chiamata corrente e inoltra i comandi dell'interfaccia web.
 *
 * <p>Porta da {@code :app/…/CallHub.java} senza cambi di sostanza: cambia il
 * package, e {@code setActivity}/{@code setCall}/{@code clear} chiamano
 * {@link MainActivity#pushCall()}, che sotto Gecko manda l'evento sulla porta
 * nativa invece di eseguire JavaScript in una WebView. Il resto non tocca né la
 * WebView né GeckoView, ed è per questo che il porto è pulito.
 *
 * <p><b>Perché è tutto {@code static}</b>: l'InCallService e la MainActivity sono
 * due componenti che Android crea separatamente, senza un genitore comune a cui
 * passarsi un riferimento. Il sistema garantisce che ne esista al più uno per
 * tipo, quindi lo stato condiviso può vivere qui.
 */
public final class CallHub {
    static MainActivity activity;
    static NovaInCallService service;
    static Call call;

    private CallHub() {}

    static void setActivity(MainActivity a) { activity = a; if (a != null) a.pushCall(); }
    static void setCall(Call c) { call = c; if (activity != null) activity.pushCall(); }
    static void clear() { call = null; if (activity != null) activity.pushCall(); }

    // comandi dall'interfaccia web (via ponte)
    static void answer() { if (call != null) call.answer(0); }

    /** Riaggancia. In suoneria {@code reject} invece di {@code disconnect}: sono due
     *  gesti diversi per il sistema — il primo rifiuta una chiamata che non è mai
     *  stata risposta, il secondo chiude una conversazione. Con {@code disconnect} su
     *  una chiamata in arrivo il registro delle chiamate la segnerebbe come persa
     *  invece che rifiutata. */
    static void hangup() {
        if (call == null) return;
        if (call.getState() == Call.STATE_RINGING) call.reject(false, null);
        else call.disconnect();
    }

    static void mute(boolean m) { if (service != null) service.setMuted(m); }

    static void speaker(boolean s) {
        if (service != null) service.setAudioRoute(s ? CallAudioState.ROUTE_SPEAKER : CallAudioState.ROUTE_EARPIECE);
    }

    static void dtmf(String s) {
        if (call != null && s != null && !s.isEmpty()) {
            char c = s.charAt(0);
            call.playDtmfTone(c);
            call.stopDtmfTone();
        }
    }

    // ---- lettura dello stato, per la shell ----------------------------------

    /** Il numero della chiamata corrente, o stringa vuota.
     *
     *  <p>In {@code try} perché {@code getDetails()} è dato dal framework e può
     *  sollevare — per esempio quando la chiamata è stata appena rimossa e il
     *  nostro riferimento è più vecchio di un istante. Un numero vuoto è una
     *  risposta accettabile; un'eccezione che sale fino a {@code pushCall} no. */
    static String numero() {
        try { return call.getDetails().getHandle().getSchemeSpecificPart(); }
        catch (Exception e) { return ""; }
    }

    /** Lo stato della chiamata nelle quattro parole che la shell conosce
     *  ({@code bridge.js} → {@code NovaCall.update}).
     *
     *  <p>I valori di {@code Call} sono più di quattro e cambiano fra versioni di
     *  Android: la mappa li riduce, e ciò che non è previsto cade in {@code active}
     *  — la scelta prudente, perché è lo stato che tiene aperta la schermata di
     *  chiamata invece di farla sparire.
     *
     *  <p>Il controllo su {@code call} non è decorazione: senza, «nessuna chiamata»
     *  diventa una {@code NullPointerException} che {@link MainActivity#pushCall()}
     *  intercetta e registra come guasto. Il primo avvio è esattamente quel caso —
     *  {@code onResume} chiama {@code pushCall} con {@code CallHub} ancora vuoto —
     *  quindi il log di ogni avvio pulito si apriva con una traccia di eccezione che
     *  sembrava un errore. */
    static String stato() {
        if (call == null) return "ended";
        switch (call.getState()) {
            case Call.STATE_RINGING:      return "incoming";
            case Call.STATE_DIALING:
            case Call.STATE_CONNECTING:   return "dialing";
            case Call.STATE_DISCONNECTED: return "ended";
            default:                      return "active";
        }
    }

    /** Lo stato in JSON, la forma che la shell legge dal getter
     *  {@code currentCallState} all'avvio per ritrovare una chiamata già in corso.
     *  {@code null} quando non c'è nessuna chiamata.
     *
     *  <p>Costruito qui e non in {@code MainActivity} perché è l'unico modo per
     *  avere una sola mappa stato→parola: {@code pushCall} e il getter la usano
     *  entrambi, e due copie divergerebbero proprio nel caso che conta — al boot la
     *  shell crederebbe a una parola e agli aggiornamenti a un'altra. */
    static String statoJson() {
        if (call == null) return null;
        String num = numero().replace("\\", "\\\\").replace("\"", "\\\"");
        return "{\"state\":\"" + stato() + "\",\"number\":\"" + num + "\"}";
    }
}
