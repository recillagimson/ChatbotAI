/**
 * The auth route group is a bare passthrough: each screen renders its own
 * <AuthShell>, because the top-right link and the optional rail differ per
 * screen and a Next layout can't take props from the page inside it.
 *
 * The dark ground is set here as well as in the shell so a slow page never
 * flashes white behind the transition.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-[#15123a]">{children}</div>;
}
