"use server";

import { appOrigin } from "@/lib/app-origin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function postAuthRedirect(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  const { data: prof } = await supabase
    .from("profiles")
    .select("has_finished_account_intro")
    .eq("id", user.id)
    .maybeSingle();
  if (!prof?.has_finished_account_intro) return "/account";
  return "/";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Email and password are required."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect(await postAuthRedirect(supabase));
}

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !password) {
    redirect("/signup?error=" + encodeURIComponent("Email and password are required."));
  }

  if (password.length < 8) {
    redirect("/signup?error=" + encodeURIComponent("Password must be at least 8 characters."));
  }

  const supabase = await createClient();
  const origin = await appOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${origin}/`,
    },
  });

  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  if (data.session) {
    redirect(await postAuthRedirect(supabase));
  }

  redirect(
    "/signup?message=" +
      encodeURIComponent("Check your email to confirm, then sign in."),
  );
}
