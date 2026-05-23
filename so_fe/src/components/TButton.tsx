import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "danger" | "ghost" | "outline";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  default:
    "bg-surface text-foreground border-border hover:border-accent",
  primary:
    "bg-success text-background border-success hover:brightness-110",
  danger:
    "bg-danger text-background border-danger hover:brightness-110",
  ghost:
    "bg-transparent text-foreground border-transparent hover:bg-surface",
  outline:
    "bg-transparent text-foreground border-border hover:border-accent hover:text-accent",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function TButton({ variant = "default", size = "md", className, children, onClick, type, disabled, title, "aria-label": ariaLabel }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onClick={onClick}
      type={type}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center justify-center gap-2 border font-mono uppercase tracking-wider tactile rounded-sm select-none disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
