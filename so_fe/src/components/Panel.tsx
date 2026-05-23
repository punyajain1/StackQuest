import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  title?: string;
  glow?: boolean;
}

export function Panel({ children, className, header, title, glow }: PanelProps) {
  return (
    <div
      className={cn(
        "relative rounded-md border border-hairline bg-surface overflow-hidden",
        glow && "neon-ring",
        className,
      )}
    >
      {(header || title) && (
        <div className="flex items-center justify-between gap-2 border-b border-hairline bg-background/40 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            {title && (
              <span className="ml-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">{header}</div>
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
