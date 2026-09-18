/**
 * The Aurum route group.
 *
 * Importing styles/aurum.css here rather than in app/globals.css is what keeps
 * the two design systems from colliding: every Aurum token is scoped to the
 * `.aurum` class, and that class is applied by the pages in this group only.
 * The dashboard, admin console and existing marketing site keep running on the
 * indigo system on the same deploy.
 */
import "@/styles/aurum.css";

export default function AurumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="aurum min-h-dvh bg-au-canvas">{children}</div>;
}
