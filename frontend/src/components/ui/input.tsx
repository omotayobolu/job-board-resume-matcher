import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-[rgba(117,120,129,1)] placeholder:text-base selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-[rgba(229,229,229,1)] flex h-14 w-full min-w-0 rounded-xl border bg-[rgba(245,247,251,1)] px-4.5 py-4 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm font-normal file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 text-dark-grey",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
