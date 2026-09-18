package os.nova.gecko;

import android.content.Intent;
import android.telecom.Call;
import android.telecom.InCallService;

/**
 * Servizio di chiamata di NovaOS. Attivo solo quando NovaOS è il "telefono
 * predefinito" (ROLE_DIALER). Riceve le chiamate in entrata/uscita dal sistema
 * telefonico e le inoltra all'interfaccia web tramite {@link CallHub}, così la
 * schermata di chiamata è quella di NovaOS e non quella di sistema.
 *
 * <p>Porta da {@code :app/…/NovaInCallService.java} senza modifiche: è il pezzo
 * che meno dipende da come è fatta la schermata — parla solo con CallHub, e
 * CallHub è l'unico punto in cui WebView e GeckoView si distinguono.
 *
 * <p>Perché il servizio esista davvero servono tre cose insieme, e mancarne una
 * lo rende invisibile senza un errore: la voce {@code <service>} nel manifest con
 * {@code BIND_INCALL_SERVICE}, il meta-data {@code IN_CALL_SERVICE_UI}, e i
 * quattro intent-filter su MainActivity (DIAL, DIAL+tel, VIEW tel, CALL tel) —
 * senza questi ultimi {@code RoleManager} rifiuta la richiesta del ruolo
 * segnalando "missing RequiredComponent".
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
        // Porta NovaOS in primo piano per mostrare la schermata di chiamata: senza
        // questo, una chiamata in arrivo mentre l'utente è in un'altra app farebbe
        // suonare il telefono senza che nulla lo mostri.
        //
        // L'origine va detta esplicitamente, e non è una formalità: questo è l'unico
        // punto in cui l'Activity viene avviata da un componente che non ha ricevuto
        // un intent dall'utente. Senza l'extra, la shell partiva da `asset` — l'origine
        // che il content script non aggancia — quindi senza ponte: la chiamata sarebbe
        // arrivata, l'app si sarebbe aperta, e la schermata di chiamata non sarebbe
        // comparsa, perché `currentCallState` non avrebbe avuto chi lo leggesse.
        // Scoperto provando proprio questo caso: processo ucciso in background, chiamata
        // in arrivo, telecom che ci riavvia.
        startActivity(new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("origin", MainActivity.ORIGIN_LOCAL));
    }

    @Override public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        call.unregisterCallback(callback);
        CallHub.clear();
    }
}
