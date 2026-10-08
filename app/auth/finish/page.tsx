"use client";

import { useEffect, useState } from "react";

const SUPABASE_URL = "https://xfwsnshhlfjzflobuoxd.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd3Nuc2hobGZqemZsb2J1b3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODg2NDUsImV4cCI6MjA5NDI2NDY0NX0.gZnNb3EEEy9H3ZZ-B-1lSSSbbldJkIuS0zcFmT6Wjec";

type SupabaseGlobal = {
  createClient: (
    url: string,
    key: string,
    options: { auth: { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean } },
  ) => {
    auth: {
      setSession: (session: { access_token: string; refresh_token: string }) => Promise<{
        data?: { session?: { access_token: string; refresh_token?: string; user: unknown } };
      }>;
    };
  };
};

export default function FinishSignIn() {
  const [message, setMessage] = useState("Signing you in");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error")) {
      window.location.replace("/signin.html?auth_error=1");
      return;
    }
    const accessToken = params.get("at");
    if (!accessToken) {
      window.location.replace("/");
      return;
    }

    let tries = 0;
    const wait = window.setInterval(() => {
      const supabase = (window as Window & { supabase?: SupabaseGlobal }).supabase;
      if (++tries > 100) {
        window.clearInterval(wait);
        window.location.replace("/signin.html?auth_error=sdk");
        return;
      }
      if (!supabase?.createClient) return;
      window.clearInterval(wait);
      const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      client.auth.setSession({ access_token: accessToken, refresh_token: params.get("rt") || "" }).then((result) => {
        const session = result.data?.session;
        if (!session) {
          window.location.replace("/signin.html?auth_error=1");
          return;
        }
        try {
          localStorage.setItem(
            "mocha_sb_session",
            JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token || "",
              user: session.user,
            }),
          );
        } catch {
          setMessage("Signed in");
        }
        window.location.replace("/dashboard.html");
      });
    }, 60);

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    script.async = true;
    document.head.appendChild(script);
    return () => window.clearInterval(wait);
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-cobalt text-white">
      <p className="font-mono text-[12px] uppercase tracking-[0.22em]">{message}</p>
    </main>
  );
}
