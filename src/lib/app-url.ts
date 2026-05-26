/** Canonical public site (no trailing slash). */
export const PRODUCTION_APP_ORIGIN = "https://splicesail.com";

export const LOCAL_DEV_APP_ORIGIN = "http://localhost:3000";

const PRODUCTION_HOSTS = new Set(["splicesail.com", "www.splicesail.com"]);

/** Env override, else production domain in prod builds, else local dev. */
export function configuredAppOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return PRODUCTION_APP_ORIGIN;
  return LOCAL_DEV_APP_ORIGIN;
}

export function isProductionAppHost(host: string): boolean {
  const bare = host.split(":")[0]?.toLowerCase() ?? "";
  return PRODUCTION_HOSTS.has(bare);
}
