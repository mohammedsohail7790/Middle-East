"use server";

import { headers } from "next/headers";
import { buildAuthCallbackUrlForRequest } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignUpResult =
  | { ok: true; needsConfirmation: true; emailRedirectTo: string }
  | { ok: true; needsConfirmation: false }
  | { ok: false; error: string };

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
  companyName: string;
}): Promise<SignUpResult> {
  const hdrs = await headers();
  const emailRedirectTo = buildAuthCallbackUrlForRequest(hdrs, "/onboarding");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo,
      data: {
        full_name: input.fullName,
        company_name: input.companyName,
      },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data.session) {
    return { ok: true, needsConfirmation: true, emailRedirectTo };
  }

  return { ok: true, needsConfirmation: false };
}

export async function resendSignupConfirmation(email: string): Promise<{
  ok: boolean;
  error?: string;
  emailRedirectTo?: string;
}> {
  const hdrs = await headers();
  const emailRedirectTo = buildAuthCallbackUrlForRequest(hdrs, "/onboarding");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, emailRedirectTo };
}
