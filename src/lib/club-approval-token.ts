import { createHmac, timingSafeEqual } from "node:crypto";

export type ClubApprovalAction = "approve" | "reject";

type TokenPayload = {
  groupId: string;
  action: ClubApprovalAction;
  exp: number;
};

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.SPLICE_CLUB_APPROVAL_SECRET?.trim();
  if (!value) {
    throw new Error("Missing SPLICE_CLUB_APPROVAL_SECRET");
  }
  return value;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload: string): TokenPayload | null {
  try {
    const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as TokenPayload;
    if (
      typeof parsed.groupId !== "string" ||
      (parsed.action !== "approve" && parsed.action !== "reject") ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createClubApprovalToken(groupId: string, action: ClubApprovalAction): string {
  const payload: TokenPayload = {
    groupId,
    action,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = encodePayload(payload);
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyClubApprovalToken(token: string): TokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  const payload = decodePayload(encoded);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}
