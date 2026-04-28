export interface Env {
  ASSETS: Fetcher;
  GITHUB_REPO: string;       // "owner/repo" — the repo being forked
  GITHUB_CLIENT_ID: string;  // installer OAuth App client ID
  GITHUB_CLIENT_SECRET: string;
}

const SCOPES = "read:user,public_repo";
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect.toString(),
      // Clear the state cookie
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
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
