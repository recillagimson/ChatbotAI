/**
 * The auth route group is a bare passthrough: each screen renders its own
 * <AuthShell>, because the navy panel's content differs per screen and a layout
 * can't receive props from the page inside it.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-white">{children}</div>;
}
