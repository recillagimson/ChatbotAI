"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

type Entry = {
  id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  chatbots: { name: string } | null;
};

export function KnowledgeBaseList({ entries }: { entries: Entry[] }) {
  const router = useRouter();

  async function remove(id: string) {
    if (!confirm("Delete this knowledge entry?")) return;
    const supabase = createClient();
    await supabase.from("knowledge_base").delete().eq("id", id);
    router.refresh();
  }

  if (!entries.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No knowledge entries yet. Add your first one above.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <Card key={e.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{e.title}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{e.chatbots?.name ?? "—"}</Badge>
                <Badge variant="outline">{e.source_type}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
              {e.content}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
