export function SignInButtons() {
  return (
    <div className="flex gap-2">
      <a href="/api/auth/signin/github" className="btn btn-outline btn-sm">
        Sign in with GitHub
      </a>
    </div>
  );
}
