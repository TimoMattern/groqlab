import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-[var(--primary)] text-white hover:brightness-110",
        variant === "secondary" && "bg-[var(--muted)] hover:bg-[var(--accent)]",
        variant === "ghost" && "hover:bg-[var(--muted)]",
        variant === "destructive" && "bg-[var(--destructive)] text-white hover:brightness-110",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-4 text-sm",
        size === "lg" && "h-10 px-6 text-base",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
