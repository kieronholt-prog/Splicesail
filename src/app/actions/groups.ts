"use server";

import { sendNewClubApprovalRequestEmail } from "@/lib/club-approval-email";
import { getServerAuth } from "@/lib/supabase/auth-cache";
import { redirect } from "next/navigation";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createGroupAction(formData: FormData) {
  const { supabase, user } = await getServerAuth();

  if (!user) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim().toLowerCase();
  const slug = slugRaw.length > 0 ? slugRaw : null;

  if (!name) {
    redirect("/groups/new?error=" + encodeURIComponent("Group name is required."));
  }

  if (slug !== null && !slugPattern.test(slug)) {
    redirect(
      "/groups/new?error=" +
        encodeURIComponent(
          "Slug must be lowercase letters, numbers, and hyphens (e.g. wembley-sc).",
        ),
    );
  }

  const { error: insertErr } = await supabase.from("groups").insert({
    name,
    slug,
    created_by: user.id,
    approval_status: "pending",
  });

  if (insertErr) {
    redirect("/groups/new?error=" + encodeURIComponent(insertErr.message));
  }

  const { data: row, error: readErr } = await supabase
    .from("groups")
    .select("id")
    .eq("created_by", user.id)
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr || !row) {
    redirect(
      "/groups/new?error=" +
        encodeURIComponent(
          readErr?.message ??
            "Group was created but could not be loaded — refresh Groups.",
        ),
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const emailResult = await sendNewClubApprovalRequestEmail({
    groupId: row.id,
    clubName: name,
    clubSlug: slug,
    creatorEmail: user.email ?? null,
    creatorDisplayName: profile?.display_name ?? null,
  });

  if (!emailResult.sent) {
    redirect(
      `/groups/${row.id}?pending=1&email_error=${encodeURIComponent(
        emailResult.error ?? "Approval email could not be sent.",
      )}`,
    );
  }

  redirect(`/groups/${row.id}?pending=1`);
}
