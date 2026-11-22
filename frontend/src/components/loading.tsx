import { Logo } from "@/components/logo";
import { useEffect, useState } from "react";

const SHOW_DELAY_MS = 200;

type LoadingProps = {
  label?: string;
};

const Loading = ({ label = "Loading your workspace…" }: LoadingProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background"
    >
      <div className="scale-150 motion-safe:animate-pulse">
        <Logo variant="icon" />
      </div>
      <span
        aria-hidden="true"
        className="size-5 rounded-full border-2 border-purple/25 border-t-purple motion-safe:animate-spin"
      />
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : null}
    </div>
  );
};

export default Loading;
