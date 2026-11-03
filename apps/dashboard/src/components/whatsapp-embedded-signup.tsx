"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  appId: string;
  configId: string;
  onConnected: () => void | Promise<void>;
  onError: (message: string) => void;
  label: string;
  failedMessage: string;
  className?: string;
}

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const SDK_VERSION = "v21.0";

function loadFacebookSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const init = () => { window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: SDK_VERSION }); resolve(); };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    if (document.getElementById("facebook-jssdk")) return;
    const s = document.createElement("script");
    s.id = "facebook-jssdk";
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.onerror = () => reject(new Error("Facebook SDK blocked or unavailable"));
    document.body.appendChild(s);
  });
}

/** Meta Embedded Signup: the pop-up returns a one-time code (login callback) and the chosen number + account (message event). */
export function EmbeddedSignupButton({ appId, configId, onConnected, onError, label, failedMessage, className }: Props) {
  const [busy, setBusy] = useState(false);
  const session = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www|web)\.facebook\.com$/.test(e.origin)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          session.current = { phoneNumberId: String(data.data?.phone_number_id ?? ""), wabaId: String(data.data?.waba_id ?? "") };
        }
      } catch { /* not our message */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const finish = useCallback(async (code: string) => {
    // The message event and the login callback can arrive in either order; wait briefly for the number.
    for (let i = 0; i < 20 && !(session.current.phoneNumberId && session.current.wabaId); i++) await new Promise((r) => setTimeout(r, 250));
    const { phoneNumberId, wabaId } = session.current;
    if (!phoneNumberId || !wabaId) throw new Error(failedMessage);
    await api.post("/channels/whatsapp/embedded-signup", { code, phoneNumberId, wabaId });
    await onConnected();
  }, [failedMessage, onConnected]);

  async function start() {
    setBusy(true);
    session.current = {};
    try {
      await loadFacebookSdk(appId);
      window.FB!.login((r) => {
        const code = r.authResponse?.code;
        if (!code) { setBusy(false); return; } // closed the pop-up
        finish(code).catch((e) => onError(e instanceof Error ? e.message : failedMessage)).finally(() => setBusy(false));
      }, {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      });
    } catch (e) {
      setBusy(false);
      onError(e instanceof Error ? e.message : failedMessage);
    }
  }

  return <button type="button" className={className} disabled={busy} onClick={() => void start()}>{label}</button>;
}
