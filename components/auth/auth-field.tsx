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
 * The auth form controls: a boxed field with a leading icon, the primary
 * button, and the message banner.
 *
 * The focus treatment is a ring rather than a thicker border - the design's
 * 1px -> 1.5px border change would shift every character in the field by half a
 * pixel when you click into it.
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
        <label htmlFor={id} className="text-xs font-semibold leading-none text-ss-body">
          {label}
        </label>
        {action && <div className="ml-auto">{action}</div>}
      </div>

      <div
        className={cn(
          "mt-2 flex items-center gap-2.5 rounded-chip border border-ss-line bg-ss-page-alt px-3.5 py-[13px] transition-colors",
          "focus-within:border-ss-indigo focus-within:bg-white focus-within:ring-[3px] focus-within:ring-ss-indigo/[0.12]",
          className
        )}
      >
        {Icon && (
          <Icon
            className="h-[18px] w-[18px] shrink-0 text-ss-muted peer-focus:text-ss-indigo"
            aria-hidden
          />
        )}
        <input
          id={id}
          {...props}
          type={isPassword && show ? "text" : props.type}
          className={cn(
            "w-full min-w-0 bg-transparent text-[13.5px] leading-none text-ss-ink outline-none placeholder:text-ss-faint",
            isPassword && !show && props.value ? "tracking-[0.18em]" : ""
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="-my-1 shrink-0 p-1 text-ss-muted transition-colors hover:text-ss-body"
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
        <p className="mt-[7px] text-[11.5px] leading-[1.4] text-ss-muted">{hint}</p>
      )}
    </div>
  );
}

/** The indigo primary action. */
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
        "flex w-full items-center justify-center gap-2.5 rounded-chip bg-ss-indigo p-[15px] text-sm font-bold leading-none text-white",
        "shadow-[0_12px_24px_-14px_rgba(99,102,241,.95)] transition-colors hover:bg-ss-indigo-600",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
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
  error: "border-ss-rose-line bg-ss-rose-bg text-ss-rose-ink",
  success: "border-ss-green-line bg-ss-green-bg text-ss-green-ink",
  info: "border-ss-amber-line bg-ss-amber-bg text-ss-amber-ink",
  neutral: "border-ss-line bg-ss-page-alt text-ss-body",
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
 * Checkbox styled to the design's filled indigo square.
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
          checked ? "border-ss-indigo bg-ss-indigo" : "border-ss-dash bg-white"
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          required={required}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-indigo focus-visible:ring-offset-2"
        />
        {checked && (
          <Check
            className="pointer-events-none h-3 w-3 text-white"
            strokeWidth={3}
            aria-hidden
          />
        )}
      </span>
      <label htmlFor={id} className="text-[12.5px] leading-[1.5] text-ss-body">
        {children}
      </label>
    </div>
  );
}
