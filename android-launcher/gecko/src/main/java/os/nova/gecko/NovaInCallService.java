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
import android.content.Intent;
import android.telecom.Call;
import android.telecom.InCallService;
import os.nova.gecko.CallHub;
import os.nova.gecko.MainActivity;

public class NovaInCallService
extends InCallService {
    private final Call.Callback callback = new Call.Callback(){

        public void onStateChanged(Call call, int state) {
            CallHub.setCall(call);
        }
    };

    public void onCreate() {
        super.onCreate();
        CallHub.service = this;
    }

    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        call.registerCallback(this.callback);
        CallHub.setCall(call);
        this.startActivity(new Intent((Context)this, MainActivity.class).addFlags(0x10000000).putExtra("origin", "local"));
    }

    public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        call.unregisterCallback(this.callback);
        CallHub.clear();
    }
}

