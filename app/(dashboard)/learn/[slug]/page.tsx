import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { LESSONS, lessonBySlug } from "@/lib/learn";
import { PageBody, PageHeader, PageShell } from "@/components/ss/page";
import { SsCard, SsCardHead } from "@/components/ss/card";
import { SsChip } from "@/components/ss/controls";

/**
 * Rendered per request, even though the lesson text is a constant.
 *
 * This route sits under the dashboard layout, which calls `redirect("/login")`
 * when there's no session. Pre-rendering it would run that layout with no user
 * and bake the redirect into the output - a signed-in reader would then be sent
 * to /login, and the middleware would bounce them on to /dashboard. The lesson
 * would be permanently unreachable while every check still looked green.
 */
export const dynamic = "force-dynamic";

/**
 * One lesson.
 *
 * Written, not filmed - the design draws these as video cards, but a written
 * page is what this product can actually ship today, it's searchable, and it can
 * be corrected the same day the behaviour it describes changes. The card
 * thumbnails keep the design's shape; the durations are honest reading times.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lesson = lessonBySlug(slug);
  if (!lesson) notFound();

  const index = LESSONS.findIndex((l) => l.slug === slug);
  const next = LESSONS[index + 1] ?? null;

  return (
    <PageShell>
      <PageHeader
        title={lesson.title}
        description={lesson.summary}
        leading={
          <Link
            href="/learn"
            className="mb-1 flex w-full items-center gap-1.5 text-[12px] font-semibold leading-none text-ss-muted transition-colors hover:text-ss-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Learn
          </Link>
        }
        actions={
          <>
            <SsChip tone="indigo" className="normal-case">
              {lesson.category}
            </SsChip>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium leading-none text-ss-muted">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {lesson.minutes} min read
            </span>
          </>
        }
      />

      <PageBody center maxWidth={760}>
        <div
          className="h-2 w-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${lesson.gradient[0]}, ${lesson.gradient[1]})`,
          }}
          aria-hidden="true"
        />

        <article className="flex flex-col gap-6">
          {lesson.body.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-[17px] font-bold leading-tight text-ss-ink">
                {section.heading}
              </h2>
              {section.paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="mt-2.5 text-[13.5px] leading-[1.75] text-ss-body"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>

        {next && (
          <SsCard className="p-[22px]">
            <SsCardHead
              title="Next up"
              description={next.summary}
              action={
                <Link
                  href={`/learn/${next.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-ss-indigo px-[13px] py-2.5 text-[12.5px] font-semibold leading-none text-white transition-colors hover:bg-ss-indigo-600"
                >
                  {next.title}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
          </SsCard>
        )}
      </PageBody>
    </PageShell>
  );
}
