import { Skeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-9 w-36 mb-2" />
        <Skeleton className="h-5 w-80" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="h-1.5 w-full bg-muted" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div>
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>

          <Skeleton className="h-10 w-32 mt-6" />
          <Skeleton className="h-4 w-48 mt-2" />

          <div className="my-6 h-px bg-border" />

          <Skeleton className="h-4 w-40 mb-4" />
          <div className="grid gap-x-6 gap-y-3 grid-cols-1 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 w-56" />
            ))}
          </div>

          <Skeleton className="h-11 w-full sm:w-48 mt-7" />
        </div>
      </div>
    </div>
  );
}
