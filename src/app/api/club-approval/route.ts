import { NextResponse } from "next/server";
import { sendClubDecisionEmailToCreator } from "@/lib/club-approval-email";
import { verifyClubApprovalToken } from "@/lib/club-approval-token";
import { createAdminClient } from "@/lib/supabase/admin";

function htmlPage(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; color: #0f2942; line-height: 1.5; }
    h1 { font-size: 1.35rem; margin-bottom: 0.5rem; }
    p { color: #3d5a73; }
    a { color: #1e6bb8; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return new NextResponse(
      htmlPage("Invalid link", "<p>This approval link is missing or malformed.</p>"),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  let payload;
  try {
    payload = verifyClubApprovalToken(token);
  } catch {
    return new NextResponse(
      htmlPage(
        "Not configured",
        "<p>Club approval is not configured on this server (missing SPLICE_CLUB_APPROVAL_SECRET).</p>",
      ),
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!payload) {
    return new NextResponse(
      htmlPage("Link expired", "<p>This approval link is invalid or has expired.</p>"),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const admin = createAdminClient();
  const { data: group, error: loadErr } = await admin
    .from("groups")
    .select("id, name, approval_status, created_by")
    .eq("id", payload.groupId)
    .maybeSingle();

  if (loadErr || !group) {
    return new NextResponse(
      htmlPage("Club not found", "<p>This club no longer exists.</p>"),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const nextStatus = payload.action === "approve" ? "approved" : "rejected";

  if (group.approval_status === nextStatus) {
    const already =
      nextStatus === "approved"
        ? `<p><strong>${escapeHtml(group.name)}</strong> is already approved.</p>`
        : `<p><strong>${escapeHtml(group.name)}</strong> is already marked as rejected.</p>`;
    return new NextResponse(htmlPage("Already handled", already), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (group.approval_status === "approved" && nextStatus === "reject") {
    return new NextResponse(
      htmlPage(
        "Cannot reject",
        `<p><strong>${escapeHtml(group.name)}</strong> is already approved and live.</p>`,
      ),
      { status: 409, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const { error: updateErr } = await admin
    .from("groups")
    .update({
      approval_status: nextStatus,
      approval_resolved_at: new Date().toISOString(),
    })
    .eq("id", group.id);

  if (updateErr) {
    return new NextResponse(
      htmlPage("Update failed", `<p>Could not update the club: ${escapeHtml(updateErr.message)}</p>`),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const { data: creatorAuth } = await admin.auth.admin.getUserById(group.created_by);
  const creatorEmail = creatorAuth.user?.email?.trim();
  if (creatorEmail) {
    await sendClubDecisionEmailToCreator({
      clubName: group.name,
      creatorEmail,
      approved: nextStatus === "approved",
    });
  }

  if (nextStatus === "approved") {
    return new NextResponse(
      htmlPage(
        "Club approved",
        `<p><strong>${escapeHtml(group.name)}</strong> is now live on Splice.</p><p>The creator has been emailed.</p>`,
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new NextResponse(
    htmlPage(
      "Club rejected",
      `<p><strong>${escapeHtml(group.name)}</strong> was rejected and will stay hidden from the directory.</p><p>The creator has been emailed.</p>`,
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
