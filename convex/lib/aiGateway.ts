/**
 * Shared Cloudflare AI Gateway builder.
 *
 * Single source of truth for constructing gateway URLs and headers.
 * Zero Convex / AI-SDK dependencies so the Cloudflare Workers bundle
 * (workers/tagger) can import it without pulling in Convex internals.
 *
 * All LLM inference in this repo MUST go through this module. Direct
 * provider SDKs, `env.AI` bindings, and raw fetches to provider hosts
 * are forbidden — see convex/__tests__/aiGatewayGuard.test.ts.
 */

export const GATEWAY_HOST = "gateway.ai.cloudflare.com";

export interface GatewayConfig {
  accountId: string;
  gatewayName: string;
  token: string;
}

export class AiGatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGatewayConfigError";
  }
}

const ACCOUNT_ID_RE = /^[a-f0-9]{32}$/i;
const GATEWAY_NAME_RE = /^[a-z0-9_-]+$/i;

function assertConfig(cfg: GatewayConfig): GatewayConfig {
  if (!cfg.accountId || !ACCOUNT_ID_RE.test(cfg.accountId)) {
    throw new AiGatewayConfigError("Invalid Cloudflare accountId (expected 32 hex chars)");
  }
  if (!cfg.gatewayName || !GATEWAY_NAME_RE.test(cfg.gatewayName)) {
    throw new AiGatewayConfigError("Invalid Cloudflare AI Gateway name");
  }
  if (!cfg.token || cfg.token.trim().length < 20) {
    throw new AiGatewayConfigError("Missing or too-short Cloudflare AI Gateway token");
  }
  return cfg;
}

/**
 * Read gateway config from a Node-style env bag (defaults to `process.env`).
 * Throws AiGatewayConfigError if any value is missing/malformed.
 */
export function readGatewayConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): GatewayConfig {
  return assertConfig({
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    gatewayName: env.CLOUDFLARE_AI_GATEWAY_NAME ?? "",
    token: env.CLOUDFLARE_AI_GATEWAY_TOKEN ?? "",
  });
}

/**
 * Read gateway config from a pre-composed gateway URL + token pair
 * (the shape Cloudflare Workers use via `wrangler.toml` vars).
 * Throws AiGatewayConfigError on parse failure.
 */
export function readGatewayConfigFromUrl(
  gatewayUrl: string | undefined,
  token: string | undefined,
): GatewayConfig {
  if (!gatewayUrl) {
    throw new AiGatewayConfigError("Missing AI_GATEWAY_URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(gatewayUrl);
  } catch {
    throw new AiGatewayConfigError(`Malformed AI_GATEWAY_URL: ${gatewayUrl}`);
  }
  if (parsed.hostname !== GATEWAY_HOST) {
    throw new AiGatewayConfigError(
      `AI_GATEWAY_URL host must be ${GATEWAY_HOST}, got ${parsed.hostname}`,
    );
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  // Expected shape: /v1/{accountId}/{gatewayName}
  if (parts.length < 3 || parts[0] !== "v1") {
    throw new AiGatewayConfigError(
      `AI_GATEWAY_URL path must be /v1/{accountId}/{gatewayName}, got ${parsed.pathname}`,
    );
  }
  return assertConfig({
    accountId: parts[1],
    gatewayName: parts[2],
    token: token ?? "",
  });
}

export function buildGatewayBaseUrl(cfg: GatewayConfig): string {
  return `https://${GATEWAY_HOST}/v1/${cfg.accountId}/${cfg.gatewayName}/compat`;
}

export function buildGatewayWorkersAiUrl(cfg: GatewayConfig, model: string): string {
  if (!model) throw new AiGatewayConfigError("Model is required");
  return `https://${GATEWAY_HOST}/v1/${cfg.accountId}/${cfg.gatewayName}/workers-ai/${model}`;
}

export function buildGatewayHeaders(
  cfg: GatewayConfig,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    "cf-aig-authorization": `Bearer ${cfg.token}`,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      // Never forward an Authorization header — Cloudflare will pass it to
      // the upstream provider and bypass unified billing.
      if (k.toLowerCase() === "authorization") continue;
      headers[k] = v;
    }
  }
  return headers;
}

/**
 * Gateway-guarded fetch. Asserts hostname, strips any inbound Authorization
 * header, and lets the caller inspect the Response (no status check — callers
 * have different needs around retry/soft-fail).
 */
export async function gatewayFetch(
  url: string,
  init: RequestInit,
  cfg: GatewayConfig,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AiGatewayConfigError(`Malformed gateway URL: ${url}`);
  }
  if (parsed.hostname !== GATEWAY_HOST) {
    throw new AiGatewayConfigError(
      `Refusing to fetch non-gateway host: ${parsed.hostname}`,
    );
  }

  const hdrs = new Headers(init.headers);
  hdrs.delete("authorization");
  // Ensure cf-aig-authorization is present even if the caller forgot.
  if (!hdrs.has("cf-aig-authorization")) {
    hdrs.set("cf-aig-authorization", `Bearer ${cfg.token}`);
  }

  return fetch(url, { ...init, headers: hdrs });
}
