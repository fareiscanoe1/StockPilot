"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callback = search.get("callbackUrl") ?? "/commander";
  const [email, setEmail] = useState("demo@earningspilot.ai");
  const [password, setPassword] = useState("demo-demo-demo");
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) setErr("Invalid credentials.");
    else router.push(callback);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Demo user from seed: <code>demo@earningspilot.ai</code> /{" "}
        <code>demo-demo-demo</code>
      </p>
      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5">
        <label className="block text-xs text-[var(--muted)]">
          Email
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </label>
        <label className="block text-xs text-[var(--muted)]">
          Password
          <input
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>
        {err && <p className="text-sm text-[var(--loss)]">{err}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white"
        >
          Continue
        </button>
      </form>
    </>
  );
}

export default function SignInPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
        <SignInForm />
      </Suspense>
      <Link href="/" className="mt-6 text-center text-sm text-[var(--muted)] hover:underline">
        ← Back
      </Link>
    </div>
  );
}
