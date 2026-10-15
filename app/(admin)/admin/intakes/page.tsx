import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageBody, PageHeader, PageShell, EmptyState } from "@/components/ss/page";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { SsPill } from "@/components/ss/controls";
import { IntakeActions } from "@/components/admin/intake-actions";
import { INTAKE_SECTIONS, intakeToPlainText, otherKey, type IntakeAnswers } from "@/lib/intake";

type Status = "new" | "reviewed";
type Row = {
  id: string;
  created_at: string;
  status: Status;
  name: string;
  email: string;
  instagram: string;
  business: string | null;
  answers: IntakeAnswers;
};

const FILTERS: { label: string; value: Status | null }[] = [
  { label: "All", value: null },
  { label: "New", value: "new" },
  { label: "Reviewed", value: "reviewed" },
];

/**
 * Admin > Intakes - submissions from the public questionnaire (/intake). Read through
 * the admin's own session (the table's superadmin select policy), like Feedback.
 */
export default async function AdminIntakesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: raw } = await searchParams;
  const status: Status | null = raw === "new" || raw === "reviewed" ? raw : null;

  const supabase = await createClient();
  let query = supabase
    .from("client_intakes")
    .select("id, created_at, status, name, email, instagram, business, answers")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <PageShell>
      <PageHeader
        title="Intakes"
        description={
          <>
            Answers from the client questionnaire. Send new clients this link:{" "}
            <span className="font-semibold text-ss-ink">www.highthrive.ai/intake</span>
          </>
        }
      />
      <PageBody>
        <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <SsPill
              key={f.label}
              href={f.value ? `/admin/intakes?status=${f.value}` : "/admin/intakes"}
              active={status === f.value}
            >
              {f.label}
            </SsPill>
          ))}
        </nav>

        {error ? (
          <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="Intakes aren't set up yet">
            Apply supabase/migrations/2026-10-15-client-intakes.sql in the Supabase SQL editor, then reload.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-8 w-8" />} title={status ? `No ${status} intakes` : "No intakes yet"}>
            When a client fills in the questionnaire, their answers show up here.
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            {rows.map((r) => (
              <SsCard key={r.id} className="p-5">
                <SsCardHead
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {r.name}
                      {r.business && <span className="font-normal text-ss-body">· {r.business}</span>}
                      {r.status === "new" && <SsPill tone="alert">New</SsPill>}
                    </span>
                  }
                  description={
                    <>
                      {r.instagram} · {r.email} ·{" "}
                      {new Date(r.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </>
                  }
                  action={<IntakeActions id={r.id} status={r.status} text={intakeToPlainText(r.answers)} />}
                />
                <details className="mt-3">
                  <summary className="cursor-pointer text-[13px] font-semibold text-ss-indigo-700">
                    Show answers
                  </summary>
                  <div className="mt-4 grid gap-6">
                    {INTAKE_SECTIONS.map((s) => {
                      const answered = s.questions.filter(
                        (q) => r.answers[q.id] || (q.other && r.answers[otherKey(q.id)])
                      );
                      if (!answered.length) return null;
                      return (
                        <section key={s.id} className="grid gap-3">
                          <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ss-body">{s.title}</h3>
                          <dl className="grid gap-3">
                            {answered.map((q) => {
                              const v = r.answers[q.id];
                              const other = q.other ? r.answers[otherKey(q.id)] : undefined;
                              return (
                                <div key={q.id} className="grid gap-1">
                                  <dt className="text-[12.5px] text-ss-body">{q.label}</dt>
                                  <dd className="min-w-0 whitespace-pre-wrap break-words text-[14px] text-ss-ink">
                                    {Array.isArray(v) ? v.join(", ") : v}
                                    {other ? `${v ? " / " : ""}Other: ${other}` : ""}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        </section>
                      );
                    })}
                  </div>
                </details>
              </SsCard>
            ))}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
