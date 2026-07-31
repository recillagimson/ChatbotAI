"use client";

import * as React from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The auth form controls on the dark card: a boxed field with a leading icon,
 * the gradient primary button, the message banner and the terms checkbox.
 *
 * Focus is a border-and-ring change on the box rather than the design's
 * 1px -> 1.5px border swap, which would shift every character in the field by
 * half a pixel the moment you clicked into it. The blanket `.grain
 * :focus-visible` outline in globals.css is suppressed for inputs specifically
 * so the two indicators don't stack; every other control here uses it.
 */

export function AuthField({
  id,
  label,
  icon: Icon,
  action,
  hint,
  adornment,
  below,
  className,
  ...props
}: {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Right-aligned control on the label row, e.g. the "Forgot?" link. */
  action?: React.ReactNode;
  /** Muted help text under the field. */
  hint?: React.ReactNode;
  /** Trailing element inside the box, e.g. a validity tick. */
  adornment?: React.ReactNode;
  /** Full-width block under the field, e.g. the strength meter. */
  below?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const isPassword = props.type === "password";
  const [show, setShow] = React.useState(false);

  return (
    <div>
      <div className="flex items-center gap-2">
        <label
          htmlFor={id}
          className="text-[11.5px] font-semibold uppercase leading-none tracking-[0.04em] text-[#9b98c8]"
        >
          {label}
        </label>
        {action && <div className="ml-auto">{action}</div>}
      </div>

      <div
        className={cn(
          "mt-2 flex items-center gap-2.5 rounded-chip border border-white/[0.11] bg-white/[0.04] px-3.5 py-[13px] transition-colors",
          "focus-within:border-[#8b5cf6] focus-within:bg-[#7c22c4]/10 focus-within:ring-[3px] focus-within:ring-[#8b5cf6]/20",
          className
        )}
      >
        {Icon && (
          <Icon className="h-[18px] w-[18px] shrink-0 text-[#8b88b8]" aria-hidden />
        )}
        <input
          id={id}
          {...props}
          type={isPassword && show ? "text" : props.type}
          className={cn(
            "w-full min-w-0 bg-transparent text-[13.5px] leading-none text-white outline-none placeholder:text-[#6e6b9c]",
            isPassword && !show && props.value ? "tracking-[0.18em]" : ""
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="-my-1 shrink-0 p-1 text-[#8b88b8] transition-colors hover:text-white"
            aria-label={show ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {show ? (
              <EyeOff className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <Eye className="h-[18px] w-[18px]" aria-hidden />
            )}
          </button>
        ) : (
          adornment
        )}
      </div>

      {below}
      {hint && (
        <p className="mt-[7px] text-[11.5px] leading-[1.4] text-[#8b88b8]">{hint}</p>
      )}
    </div>
  );
}

/** The gradient primary action. */
export function AuthSubmit({
  loading,
  loadingLabel,
  children,
  ...props
}: {
  loading?: boolean;
  loadingLabel?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        "flex w-full items-center justify-center gap-2.5 rounded-chip p-[15px] text-sm font-bold leading-none text-white",
        "bg-[linear-gradient(120deg,#7c22c4,#5355cb)] shadow-[0_18px_36px_-16px_rgba(124,34,196,.95)]",
        "transition-[filter,opacity] hover:brightness-110",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100",
        props.className
      )}
    >
      {loading ? (
        <>
          <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
          {loadingLabel ?? "Working…"}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
        </>
      )}
    </button>
  );
}

const NOTICE_TONES = {
  error: "border-[#e11d48]/40 bg-[#e11d48]/[0.14] text-[#fca5b5]",
  success: "border-[#34d399]/[0.3] bg-[#34d399]/[0.12] text-[#9ee7c6]",
  info: "border-[#fbbf24]/[0.3] bg-[#d97706]/[0.14] text-[#fcd9a0]",
  neutral: "border-white/[0.1] bg-white/[0.05] text-[#b6b4dd]",
};

/** Inline status message. `role="alert"` only for errors, so success text
 *  doesn't interrupt a screen reader mid-sentence. */
export function AuthNotice({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof NOTICE_TONES;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-chip border px-3.5 py-3 text-[12.5px] leading-[1.5]",
        NOTICE_TONES[tone]
      )}
    >
      {children}
    </div>
  );
}

/**
 * Checkbox styled to the design's filled gradient square.
 *
 * The tick is a real <Check> element rather than a CSS background image: an
 * inline `checked:bg-[url(data:image/svg+xml…)]` is silently dropped by
 * Tailwind's class parser, which leaves a filled square with no tick in it -
 * checked and unchecked become impossible to tell apart.
 *
 * The native input stays in the DOM, stretched over the square, so keyboard
 * focus, `required` validation and screen readers all behave normally.
 */
export function AuthCheckbox({
  id,
  checked,
  onChange,
  children,
  required,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          checked
            ? "border-transparent bg-[linear-gradient(120deg,#7c22c4,#5355cb)]"
            : "border-white/[0.24] bg-white/[0.06]"
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          required={required}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[5px]"
        />
        {checked && (
          <Check
            className="pointer-events-none h-3 w-3 text-white"
            strokeWidth={3}
            aria-hidden
          />
        )}
      </span>
      <label htmlFor={id} className="text-[12.5px] leading-[1.5] text-[#b6b4dd]">
        {children}
      </label>
    </div>
  );
}
