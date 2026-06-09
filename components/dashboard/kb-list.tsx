"use client";

import { useState, useTransition } from "react";
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
  indexed?: boolean;
  needs_review?: boolean;
};

export function KnowledgeBaseList({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic delete: hide the row immediately, then confirm with the server.
  // Tracking removed ids (rather than a copy of the list) means the next server
  // refresh — which returns the list already without these rows — just works.
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  function remove(id: string) {
    if (!confirm("Delete this knowledge entry?")) return;
    setRemoved((s) => new Set(s).add(id));
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("knowledge_base")
        .delete()
        .eq("id", id);
      if (error) {
        setRemoved((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        return;
      }
      router.refresh();
    });
  }

  const visible = entries.filter((e) => !removed.has(e.id));

  if (!visible.length) {
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
      {visible.map((e) => (
        <Card key={e.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{e.title}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{e.chatbots?.name ?? "—"}</Badge>
                <Badge variant="outline">{e.source_type}</Badge>
                {e.needs_review && (
                  <Badge variant="destructive">needs review</Badge>
                )}
                {e.indexed && <Badge variant="outline">indexed</Badge>}
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
