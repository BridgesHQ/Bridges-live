export function Notice({searchParams}: {searchParams?: {error?: string; notice?: string}}) {
  if (searchParams?.error) return <div className="card p-4 mt-4 border-red-300 bg-red-50 text-red-800">{searchParams.error}</div>;
  if (searchParams?.notice) return <div className="card p-4 mt-4 border-emerald-300 bg-emerald-50 text-emerald-800">{searchParams.notice}</div>;
  return null;
}
