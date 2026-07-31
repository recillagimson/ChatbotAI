import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Text field, shaped to the dashboard blueprint: 11px corners, a border one
 * step stronger than a card hairline so a field reads as editable, and an
 * indigo focus ring instead of the browser default.
 *
 * Still token-driven (`border-input`, `bg-background`) rather than pinned to the
 * `ss-*` palette, because the auth, admin and marketing surfaces share this
 * primitive and need their own colours - including dark mode.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-ctl-lg border border-input bg-background px-3.5 py-3 text-[13px] leading-none transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-muted-foreground/80",
        "focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
export { Input };
