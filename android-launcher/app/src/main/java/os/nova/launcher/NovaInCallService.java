package os.nova.launcher;

import android.content.Intent;
import android.telecom.Call;
import android.telecom.InCallService;

/**
 * Servizio di chiamata di NovaOS. Attivo solo quando NovaOS è il "telefono
 * predefinito" (ROLE_DIALER). Riceve le chiamate in entrata/uscita dal sistema
 * telefonico e le inoltra all'interfaccia web tramite CallHub, così la
 * schermata di chiamata è quella di NovaOS e non quella di sistema.
 */
public class NovaInCallService extends InCallService {

    private final Call.Callback callback = new Call.Callback() {
        @Override public void onStateChanged(Call call, int state) { CallHub.setCall(call); }
    };

    @Override public void onCreate() { super.onCreate(); CallHub.service = this; }

    @Override public void onCallAdded(Call call) {
        super.onCallAdded(call);
        call.registerCallback(callback);
        CallHub.setCall(call);
        // porta NovaOS in primo piano per mostrare la schermata di chiamata
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    @Override public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        call.unregisterCallback(callback);
        CallHub.clear();
    }
}
