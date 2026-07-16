function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/80 ${className}`} />;
}

function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] ${tall ? "min-h-56" : ""}`}>
      <SkeletonLine className="h-3 w-28" />
      <SkeletonLine className="mt-5 h-7 w-40" />
      <SkeletonLine className="mt-4 h-3 w-full" />
      <SkeletonLine className="mt-2 h-3 w-4/5" />
    </div>
  );
}

export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace" className="space-y-6">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="mt-5 h-9 w-72 max-w-full" />
        <SkeletonLine className="mt-4 h-4 w-[34rem] max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
        <SkeletonCard tall />
        <SkeletonCard tall />
      </div>
    </div>
  );
}
