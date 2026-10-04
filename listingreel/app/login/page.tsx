'use client';
import {useState} from 'react';
import {supabaseBrowser} from '@/lib/supabase/client';

export default function Login({searchParams}: {searchParams: {next?: string; error?: string}}) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(searchParams.error || '');
  const next = searchParams.next?.startsWith('/') && !searchParams.next.startsWith('//') ? searchParams.next : '/dashboard';
  const callback = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const {error} = await supabaseBrowser().auth.signInWithOtp({email, options: {emailRedirectTo: callback()}});
    setMsg(error?.message || 'Check your email for the sign-in link.');
  }
  async function google() {
    const {error} = await supabaseBrowser().auth.signInWithOAuth({provider: 'google', options: {redirectTo: callback()}});
    if (error) setMsg(error.message);
  }
  return (
    <main className="min-h-screen grid place-items-center">
      <form onSubmit={go} className="card p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold">Sign in to ListingReel</h1>
        <input type="email" required className="border rounded p-3 w-full mt-5" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary w-full mt-3">Email me a sign-in link</button>
        <button type="button" className="btn btn-secondary w-full mt-3" onClick={google}>Continue with Google</button>
        {msg && <p className="text-sm mt-4">{msg}</p>}
      </form>
    </main>
  );
}
