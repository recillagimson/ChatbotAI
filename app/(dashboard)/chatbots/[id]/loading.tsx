import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChatbotDetailLoading() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Pinned header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Skeleton className="h-9 w-56 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      {/* Tab bar (segmented control) */}
      <div className="mb-6">
        <Skeleton className="h-11 w-full max-w-lg rounded-lg" />
      </div>

      {/* Active panel */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44 mb-2" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}
