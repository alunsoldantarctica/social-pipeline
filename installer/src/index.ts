export interface Env {
  ASSETS: Fetcher;
  GITHUB_REPO: string;       // "owner/repo" — the repo being forked
  GITHUB_CLIENT_ID: string;  // installer OAuth App client ID
  GITHUB_CLIENT_SECRET: string;
}

const SCOPES = "read:user,repo";
const COOKIE_NAME = "gh_oauth_state";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/auth/github") {
      return startOAuth(url, env);
    }

    if (url.pathname === "/auth/callback") {
      return handleCallback(request, url, env);
    }

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/api/cf-validate" && request.method === "POST") {
      return proxyCFValidate(request);
    }

    if (url.pathname === "/api/cf-zones" && request.method === "POST") {
      return proxyCFZones(request);
    }

    if (url.pathname === "/api/cf-provision" && request.method === "POST") {
      return proxyCFProvision(request);
    }

    if (url.pathname === "/api/trigger-deploy" && request.method === "POST") {
      return triggerDeploy(request);
    }

    // Everything else (/, /img/*, etc.) served from static assets
    return env.ASSETS.fetch(request);
  },
};

function startOAuth(requestUrl: URL, env: Env): Response {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${requestUrl.origin}/auth/callback`,
    scope: SCOPES,
    state,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://github.com/login/oauth/authorize?${params}`,
      "Set-Cookie": `${COOKIE_NAME}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`,
    },
  });
}

async function handleCallback(request: Request, url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Validate CSRF state
  const cookie = parseCookie(request.headers.get("Cookie") ?? "");
  if (!state || !code || cookie[COOKIE_NAME] !== state) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });

  if (!tokenRes.ok) {
    return new Response("Token exchange failed", { status: 502 });
  }

  const { access_token, error } = await tokenRes.json() as { access_token?: string; error?: string };
  if (!access_token) {
    return new Response(`GitHub error: ${error ?? "no token"}`, { status: 400 });
  }

  // Fetch user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "social-pipeline-installer" },
  });
  if (!userRes.ok) {
    return new Response("Failed to fetch GitHub profile", { status: 502 });
  }
  const user = await userRes.json() as {
    login: string;
    name?: string;
    email?: string;
    avatar_url: string;
  };

  // Fork the repo on their behalf (idempotent — GitHub returns existing fork if already forked)
  let forkUrl = `https://github.com/${user.login}/${env.GITHUB_REPO.split("/")[1]}`;
  try {
    const [owner, repo] = env.GITHUB_REPO.split("/");
    const forkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/forks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "social-pipeline-installer",
        Accept: "application/vnd.github+json",
      },
    });
    if (forkRes.ok) {
      const fork = await forkRes.json() as { html_url: string };
      forkUrl = fork.html_url;
    }
  } catch {
    // Fork failure is non-fatal — user can fork manually
  }

  // Redirect back to wizard with profile info in URL params
  const redirect = new URL("/", url.origin);
  redirect.searchParams.set("gh_user", user.login);
  redirect.searchParams.set("gh_name", user.name ?? user.login);
  redirect.searchParams.set("gh_avatar", user.avatar_url);
  if (user.email) redirect.searchParams.set("gh_email", user.email);
  redirect.searchParams.set("fork_url", forkUrl);
  redirect.searchParams.set("gh_token", access_token);

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect.toString(),
      // Clear the state cookie
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}

async function proxyCFValidate(request: Request): Promise<Response> {
  const { token } = await request.json() as { token?: string };
  if (!token) return json({ valid: false, error: "no token" }, 400);

  const r = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json() as { success: boolean; errors?: { message: string }[] };

  if (!d.success) {
    return json({ valid: false, error: d.errors?.[0]?.message ?? "invalid token" });
  }

  // Auto-fetch accounts
  const acctR = await fetch("https://api.cloudflare.com/client/v4/accounts?per_page=10", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const acctD = await acctR.json() as { success: boolean; result?: { id: string; name: string }[] };
  const accounts = acctD.success ? (acctD.result ?? []) : [];

  return json({ valid: true, accounts });
}

async function triggerDeploy(request: Request): Promise<Response> {
  const { token, owner, repo, ref = "main" } = await request.json() as {
    token: string; owner: string; repo: string; ref?: string;
  };
  if (!token || !owner || !repo) return json({ ok: false, error: "missing params" }, 400);

  const r = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/deploy.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "social-pipeline-installer",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
    }
  );

  if (r.status === 204) return json({ ok: true });
  const body = await r.text();
  return json({ ok: false, error: body, status: r.status });
}

async function proxyCFProvision(request: Request): Promise<Response> {
  const { token, accountId, resource } = await request.json() as {
    token: string; accountId: string; resource: string;
  };
  if (!token || !accountId) return json({ success: false, error: "missing params" }, 400);

  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const hdrs = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (resource === "kv") {
    const list = await (await fetch(`${base}/storage/kv/namespaces?per_page=100`, { headers: hdrs })).json() as { result?: { id: string; title: string }[] };
    const ex = list.result?.find(n => n.title === "social-pipeline-SESSION");
    if (ex) return json({ success: true, id: ex.id, existed: true });
    const cr = await (await fetch(`${base}/storage/kv/namespaces`, { method: "POST", headers: hdrs, body: JSON.stringify({ title: "social-pipeline-SESSION" }) })).json() as { success: boolean; result?: { id: string }; errors?: { message: string }[] };
    return json({ success: cr.success, id: cr.result?.id, error: cr.errors?.[0]?.message });
  }

  if (resource === "ai-gateway") {
    const list = await (await fetch(`${base}/ai-gateway/gateways?per_page=100`, { headers: hdrs })).json() as { result?: { slug: string }[] };
    const ex = list.result?.find(g => g.slug === "social-pipeline");
    if (ex) return json({ success: true, existed: true });
    const cr = await (await fetch(`${base}/ai-gateway/gateways`, { method: "POST", headers: hdrs, body: JSON.stringify({ name: "social-pipeline", slug: "social-pipeline" }) })).json() as { success: boolean; errors?: { message: string }[] };
    return json({ success: cr.success, error: cr.errors?.[0]?.message });
  }

  if (resource === "r2") {
    const cr = await (await fetch(`${base}/r2/buckets`, { method: "POST", headers: hdrs, body: JSON.stringify({ name: "social-pipeline-uploads" }) })).json() as { success: boolean; errors?: { code: number; message: string }[] };
    if (cr.success) return json({ success: true });
    if (cr.errors?.[0]?.code === 10006) return json({ success: true, existed: true });
    return json({ success: false, error: cr.errors?.[0]?.message });
  }

  return json({ success: false, error: "unknown resource" }, 400);
}

async function proxyCFZones(request: Request): Promise<Response> {
  const { token } = await request.json() as { token?: string };
  if (!token) return json({ zones: [] }, 400);

  const r = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=50&status=active", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json() as { success: boolean; result?: { id: string; name: string }[] };
  const zones = d.success ? (d.result ?? []) : [];

  return json({ zones });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseCookie(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=").trim()];
    })
  );
}
