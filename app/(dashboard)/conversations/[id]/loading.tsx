import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function ConversationDetailLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <Skeleton className="h-8 w-40 mb-4" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      <Skeleton className="h-9 w-full" />

      <Card className="mt-6">
        <CardContent className="p-4 space-y-3">
          {[
            { mine: false, w: "w-48" },
            { mine: true, w: "w-56" },
            { mine: false, w: "w-40" },
            { mine: true, w: "w-64" },
            { mine: false, w: "w-52" },
          ].map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.mine ? "justify-end" : "justify-start")}
            >
              <Skeleton className={cn("h-12 rounded-lg", m.w)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
