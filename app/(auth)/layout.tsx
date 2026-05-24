import { MessageCircle } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="flex items-center gap-2 justify-center mb-8 font-bold text-xl"
        >
          <MessageCircle className="h-6 w-6 text-primary" />
          ChatPilot
        </Link>
        {children}
      </div>
    </div>
  );
}
