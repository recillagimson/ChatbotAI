import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CLAUDE_IMAGE_TYPES } from "@/lib/storage";
import type { Attachment, Feedback } from "@/lib/types";

type SignedAttachment = Attachment & { url: string | null };
type FeedbackWithSigned = Omit<Feedback, "attachments"> & {
  attachments: SignedAttachment[];
};

const IMAGE_TYPES = new Set<string>(CLAUDE_IMAGE_TYPES);

function statusBadge(status: Feedback["status"]) {
  switch (status) {
    case "new":
      return <Badge variant="default">Sent</Badge>;
    case "read":
      return <Badge variant="secondary">Seen</Badge>;
    case "resolved":
      return <Badge variant="success">Resolved</Badge>;
  }
}

function AttachmentView({ att }: { att: SignedAttachment }) {
  const isImage = IMAGE_TYPES.has(att.type);

  if (!att.url) {
    return (
      <span className="inline-flex items-center rounded border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        {att.name}
      </span>
    );
  }

  if (isImage) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.name}
          className="max-h-24 rounded border"
        />
      </a>
    );
  }

  return (
    <a
      href={att.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span aria-hidden="true">📎</span>
      <span className="max-w-[16rem] truncate">{att.name}</span>
    </a>
  );
}

export function FeedbackHistory({ items }: { items: FeedbackWithSigned[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No feedback yet.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge(item.status)}
              <time
                dateTime={item.created_at}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {new Date(item.created_at).toLocaleDateString()}
              </time>
            </div>

            <p className="whitespace-pre-wrap text-sm">{item.message}</p>

            {item.attachments.length > 0 && (
              <ul className="flex flex-wrap items-center gap-3 pt-1">
                {item.attachments.map((att) => (
                  <li key={att.path}>
                    <AttachmentView att={att} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
