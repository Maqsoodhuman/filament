"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BrandMark from "@/components/BrandMark";

// Standard production-style sign-in: OAuth (Google / GitHub) + email & password,
// in Filament's hand. No real auth wired yet — every path enters the app at
// /notes; the form is the production-grade shell to drop real auth into.

function GoogleG() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.57 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.34-1.73-1.34-1.73-1.09-.73.08-.72.08-.72 1.21.08 1.85 1.21 1.85 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.81 0-1.28.47-2.33 1.24-3.15-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.2.96-.26 1.98-.39 3-.4 1.02.01 2.04.14 3 .4 2.28-1.52 3.29-1.2 3.29-1.2.66 1.66.25 2.88.12 3.18.77.82 1.24 1.87 1.24 3.15 0 4.51-2.81 5.5-5.49 5.79.43.36.81 1.09.81 2.2 0 1.59-.01 2.87-.01 3.26 0 .32.21.69.83.57C20.57 21.91 24 17.5 24 12.29 24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const enter = () => router.push("/notes");

  return (
    <div className="onboard-wrap">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 6 }}>
          <BrandMark />
          <span style={{ fontSize: 16 }}>Filament</span>
        </div>
        <h1>Welcome back</h1>
        <p className="auth-sub">Sign in to your library and pick up the thread.</p>

        <div className="auth-oauth">
          <button type="button" className="auth-provider" onClick={enter}>
            <GoogleG /> Continue with Google
          </button>
          <button type="button" className="auth-provider" onClick={enter}>
            <GithubMark /> Continue with GitHub
          </button>
        </div>

        <div className="auth-or">or</div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enter();
          }}
        >
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" className="auth-input" type="email" placeholder="you@example.com" autoComplete="email" required />
          </div>
          <div className="auth-field">
            <label htmlFor="password">
              Password
              <Link href="/signin">Forgot?</Link>
            </label>
            <input id="password" className="auth-input" type="password" placeholder="••••••••" autoComplete="current-password" required />
          </div>
          <button type="submit" className="auth-submit">
            Sign in <ArrowRight size={15} />
          </button>
        </form>

        <p className="auth-foot">
          New to Filament? <Link href="/onboarding">Create an account</Link>
        </p>
      </div>

      <p className="auth-legal">
        By continuing you agree to the Terms and acknowledge the Privacy Policy.
      </p>
    </div>
  );
}
