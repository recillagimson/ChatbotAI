import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CreditCard, Bot, BookOpen, Instagram } from "lucide-react";

export default function OnboardingPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-display font-semibold tracking-tight">You&apos;re in.</h1>
        <p className="text-muted-foreground">
          Four quick steps and your AI is replying to DMs.
        </p>
      </div>

      <div className="space-y-4">
        <Step
          icon={CreditCard}
          n={1}
          title="Activate your subscription"
          description="Unlock AI replies with the $997/mo plan."
          href="/billing"
          cta="Subscribe"
        />
        <Step
          icon={Bot}
          n={2}
          title="Create your chatbot"
          description="Tell us your business name, description, and tone."
          href="/chatbots/new"
          cta="Create"
        />
        <Step
          icon={BookOpen}
          n={3}
          title="Add knowledge"
          description="Upload your FAQ, hours, policies - anything the AI should know."
          href="/knowledge-base"
          cta="Add knowledge"
        />
        <Step
          icon={Instagram}
          n={4}
          title="Connect ManyChat → Instagram"
          description="Follow the 6-step guide on the Settings page."
          href="/settings"
          cta="Connect"
        />
      </div>

      <div className="text-center mt-10">
        <Button asChild variant="link">
          <Link href="/dashboard">Skip and go to dashboard →</Link>
        </Button>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  n,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  n: number;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4 space-y-0">
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">
            Step {n}. {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild>
          <Link href={href}>{cta}</Link>
        </Button>
      </CardHeader>
    </Card>
  );
}
