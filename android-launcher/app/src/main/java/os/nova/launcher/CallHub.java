package os.nova.launcher;

import android.telecom.Call;
import android.telecom.CallAudioState;

/**
 * Ponte statico tra l'InCallService (che riceve gli eventi di chiamata dal
 * sistema) e la MainActivity/WebView (che mostra la schermata di chiamata in
 * NovaOS). Tiene la chiamata corrente e inoltra i comandi dell'interfaccia web.
 */
public final class CallHub {
    static MainActivity activity;
    static NovaInCallService service;
    static Call call;

    private CallHub() {}

    static void setActivity(MainActivity a) { activity = a; if (a != null) a.pushCall(); }
    static void setCall(Call c) { call = c; if (activity != null) activity.pushCall(); }
    static void clear() { call = null; if (activity != null) activity.pushCall(); }

    // comandi dall'interfaccia web (via bridge NovaNative)
    static void answer() { if (call != null) call.answer(0); }
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
}
