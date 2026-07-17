import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <Skeleton className="h-9 w-56 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>

      <Card>
        <div className="divide-y">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-40 mb-2" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
