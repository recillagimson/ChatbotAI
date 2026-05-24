import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageCircle,
  Instagram,
  Zap,
  BookOpen,
  Inbox,
  Check,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">ChatPilot</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium hover:text-primary"
            >
              Log in
            </Link>
            <Button asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs font-medium mb-6">
            <Instagram className="h-3 w-3" />
            Instagram & Messenger AI replies, in minutes
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Never miss a DM again.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            ChatPilot is your AI teammate that answers Instagram and Messenger
            DMs 24/7 — trained on your business, your tone, and your FAQ. Set up
            in under 10 minutes.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/signup">Start now — $349/mo</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Cancel anytime. No setup fees.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="container py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Everything you need to automate your DMs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <Zap className="h-10 w-10 text-primary mb-4" />
              <h3 className="font-semibold text-lg mb-2">Instant AI replies</h3>
              <p className="text-sm text-muted-foreground">
                Powered by Claude — the most natural-sounding AI for
                conversations. Replies in seconds, in your tone.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <BookOpen className="h-10 w-10 text-primary mb-4" />
              <h3 className="font-semibold text-lg mb-2">
                Trained on your business
              </h3>
              <p className="text-sm text-muted-foreground">
                Paste your FAQ, hours, pricing, policies. The AI uses your real
                knowledge instead of guessing.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Inbox className="h-10 w-10 text-primary mb-4" />
              <h3 className="font-semibold text-lg mb-2">Unified inbox</h3>
              <p className="text-sm text-muted-foreground">
                See every conversation in one place. Jump in and take over from
                the AI any time.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing */}
      <section className="container py-16">
        <h2 className="text-3xl font-bold text-center mb-2">
          Simple, all-inclusive pricing
        </h2>
        <p className="text-center text-muted-foreground mb-12">
          One plan, everything included.
        </p>
        <Card className="max-w-md mx-auto border-primary">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="text-sm font-semibold text-primary mb-2">
                PROFESSIONAL
              </div>
              <div className="text-5xl font-bold">$349</div>
              <div className="text-muted-foreground">/month</div>
            </div>
            <ul className="space-y-3 mb-6">
              {[
                "Unlimited AI replies on Instagram & Messenger",
                "Custom knowledge base & training",
                "Conversation inbox with manual takeover",
                "Multiple chatbots & accounts",
                "Priority email support",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="w-full" size="lg">
              <Link href="/signup">Start now</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t mt-16">
        <div className="container py-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} ChatPilot. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
