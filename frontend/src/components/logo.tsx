import { cn } from "@/lib/utils";
import { Link } from "react-router";

type LogoTone = "default" | "light";

interface LogoProps {
  /** Icon only, for tight spots. The lockup is the wordmark beside the funnel. */
  variant?: "lockup" | "icon";
  /** Light is the white mark for dark backgrounds. */
  tone?: LogoTone;
  className?: string;
}

const icons: Record<LogoTone, string> = {
  default: "/logo-icon.svg",
  light: "/logo-icon-light.svg",
};

export function Logo({ variant = "lockup", tone = "default", className }: LogoProps) {
  return (
    <Link
      to="/"
      aria-label="Shortlistly"
      className={cn("inline-flex items-center gap-2.5 whitespace-nowrap", className)}
    >
      <img src={icons[tone]} alt="" width={32} height={32} className="size-8 shrink-0" />
      {variant === "lockup" ? (
        <span
          className={cn(
            "font-inter text-[1.625rem] font-semibold leading-none tracking-[-0.03em]",
            tone === "light" ? "text-white" : "text-[#0F172A]",
          )}
        >
          shortlistly
        </span>
      ) : null}
    </Link>
  );
}
