import { appOrigin } from "@/lib/app-origin";
import { createClubApprovalToken } from "@/lib/club-approval-token";

type NewClubApprovalEmailInput = {
  groupId: string;
  clubName: string;
  clubSlug: string | null;
  creatorEmail: string | null;
  creatorDisplayName: string | null;
};

type ClubDecisionEmailInput = {
  clubName: string;
  creatorEmail: string;
  approved: boolean;
};

function resendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || null;
}

function resendFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Splice <onboarding@resend.dev>";
}

function platformApproverEmail(): string | null {
  const email = process.env.SPLICE_PLATFORM_APPROVER_EMAIL?.trim();
  return email || null;
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: body || `Resend HTTP ${response.status}` };
  }

  return { ok: true };
}

function creatorLabel(email: string | null, displayName: string | null): string {
  const name = displayName?.trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return "Unknown account";
}

export async function sendNewClubApprovalRequestEmail(
  input: NewClubApprovalEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  const approver = platformApproverEmail();
  if (!approver) {
    return { sent: false, error: "SPLICE_PLATFORM_APPROVER_EMAIL is not configured" };
  }

  const origin = await appOrigin();
  const approveToken = createClubApprovalToken(input.groupId, "approve");
  const rejectToken = createClubApprovalToken(input.groupId, "reject");
  const approveUrl = `${origin}/api/club-approval?token=${encodeURIComponent(approveToken)}`;
  const rejectUrl = `${origin}/api/club-approval?token=${encodeURIComponent(rejectToken)}`;
  const slugLine = input.clubSlug ? `Short name: /${input.clubSlug}` : "Short name: (none)";
  const creator = creatorLabel(input.creatorEmail, input.creatorDisplayName);

  const subject = `Splice — approve new club: ${input.clubName}`;
  const text = [
    `A new club is waiting for your approval on Splice.`,
    ``,
    `Club: ${input.clubName}`,
    slugLine,
    `Requested by: ${creator}`,
    ``,
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
    ``,
    `These links expire in 7 days.`,
  ].join("\n");

  const html = [
    `<p>A new club is waiting for your approval on <strong>Splice</strong>.</p>`,
    `<ul>`,
    `<li><strong>Club:</strong> ${escapeHtml(input.clubName)}</li>`,
    `<li><strong>${escapeHtml(slugLine)}</strong></li>`,
    `<li><strong>Requested by:</strong> ${escapeHtml(creator)}</li>`,
    `</ul>`,
    `<p>`,
    `<a href="${approveUrl}">Approve club</a> · `,
    `<a href="${rejectUrl}">Reject club</a>`,
    `</p>`,
    `<p style="color:#666;font-size:12px;">Links expire in 7 days. No login required.</p>`,
  ].join("");

  const result = await sendResendEmail({ to: approver, subject, html, text });
  if (!result.ok) return { sent: false, error: result.error };
  return { sent: true };
}

export async function sendClubDecisionEmailToCreator(
  input: ClubDecisionEmailInput,
): Promise<{ sent: boolean; error?: string }> {
  const origin = await appOrigin();
  const subject = input.approved
    ? `Splice — ${input.clubName} is approved`
    : `Splice — ${input.clubName} was not approved`;

  const text = input.approved
    ? [
        `Good news — your club "${input.clubName}" has been approved on Splice.`,
        `Sign in to finish setup: ${origin}/club-admin`,
      ].join("\n")
    : [
        `Your request to create "${input.clubName}" on Splice was not approved.`,
        `If you think this is a mistake, reply to the person who runs Splice.`,
      ].join("\n");

  const html = input.approved
    ? `<p>Good news — your club <strong>${escapeHtml(input.clubName)}</strong> has been approved on Splice.</p><p><a href="${origin}/club-admin">Open club admin</a></p>`
    : `<p>Your request to create <strong>${escapeHtml(input.clubName)}</strong> on Splice was not approved.</p>`;

  const result = await sendResendEmail({
    to: input.creatorEmail,
    subject,
    html,
    text,
  });
  if (!result.ok) return { sent: false, error: result.error };
  return { sent: true };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
