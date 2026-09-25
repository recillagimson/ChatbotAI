import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything EXCEPT static assets, the ManyChat webhook and the public
    // marketing pages.
    //
    // This is a deny-list of public paths on purpose. Middleware is what
    // refreshes the Supabase session cookie (getClaims() in
    // lib/supabase/middleware.ts; Server Components cannot write cookies), so
    // every signed-in route must keep matching. An allow-list built from
    // isProtected would drop /statistics, /chatbots, /follow-ups, /requests,
    // /learn, /feedback, /admin, /reset-password and /auth/callback, and anyone
    // working only there would be signed out when their access token expires
    // (about 1h).
    //
    // The public pages are prerendered and served from Vercel's edge cache, but
    // middleware runs BEFORE that cache, so matching them cost every anonymous
    // visit an invocation. `$` straight after the leading slash is the site root
    // ONLY; index.rsc is the root's RSC payload file. Each named page ends in
    // (?:[/.]|$), so a route that merely starts with one of these names
    // (/privacy-settings) still gets middleware. Adding a public page? Add it
    // here AND to app/sitemap.ts; tests/middleware-matcher.spec.ts fails if a
    // sitemap page or an app/(legal) page still matches.
    // Keep this ONE string literal: Next reads it statically at build time and
    // rejects concatenation and template expressions.
    "/((?!$|index\\.rsc$|_next/static|_next/image|favicon.ico|api/webhooks|(?:book-a-call|accessibility|advertising-disclosure|disclaimer|privacy|refund-policy|terms|robots\\.txt|sitemap\\.xml|opengraph-image|twitter-image)(?:[/.]|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
