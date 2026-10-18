/*
 * SPDX-License-Identifier: MIT
 * Copyright (C) 2026 RedRider21
 *
 * Sorgente recuperato per decompilazione (CFR 0.152) dal build Gecko del
 * 2026-09-25, dopo la perdita dei sorgenti originali. Tenere presente che
 * commenti e nomi di alcune variabili locali possono essere andati persi.
 */
package os.nova.gecko;

import android.telecom.Call;
import os.nova.gecko.MainActivity;
import os.nova.gecko.NovaInCallService;

public final class CallHub {
    static MainActivity activity;
    static NovaInCallService service;
    static Call call;

    private CallHub() {
    }

    static void setActivity(MainActivity a) {
        activity = a;
        if (a != null) {
            a.pushCall();
        }
    }

    static void setCall(Call c) {
        call = c;
        if (activity != null) {
            activity.pushCall();
        }
    }

    static void clear() {
        call = null;
        if (activity != null) {
            activity.pushCall();
        }
    }

    static void answer() {
        if (call != null) {
            call.answer(0);
        }
    }

    static void hangup() {
        if (call == null) {
            return;
        }
        if (call.getState() == 2) {
            call.reject(false, null);
        } else {
            call.disconnect();
        }
    }

    static void mute(boolean m) {
        if (service != null) {
            service.setMuted(m);
        }
    }

    static void speaker(boolean s) {
        if (service != null) {
            service.setAudioRoute(s ? 8 : 1);
        }
    }

    static void dtmf(String s) {
        if (call != null && s != null && !s.isEmpty()) {
            char c = s.charAt(0);
            call.playDtmfTone(c);
            call.stopDtmfTone();
        }
    }

    static String numero() {
        try {
            return call.getDetails().getHandle().getSchemeSpecificPart();
        }
        catch (Exception e) {
            return "";
        }
    }

    static String stato() {
        if (call == null) {
            return "ended";
        }
        switch (call.getState()) {
            case 2: {
                return "incoming";
            }
            case 1: 
            case 9: {
                return "dialing";
            }
            case 7: {
                return "ended";
            }
        }
        return "active";
    }

    static String statoJson() {
        if (call == null) {
            return null;
        }
        String num = CallHub.numero().replace("\\", "\\\\").replace("\"", "\\\"");
        return "{\"state\":\"" + CallHub.stato() + "\",\"number\":\"" + num + "\"}";
    }
}

