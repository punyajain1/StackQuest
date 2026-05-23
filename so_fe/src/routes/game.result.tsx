import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Trophy, ShieldOff, Zap, Home, Flame } from "lucide-react";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";
import { useDuel } from "@/lib/duel-store";
import { useCountUp } from "@/hooks/use-count-up";

export const Route = createFileRoute("/game/result")({
  validateSearch: (s: Record<string, unknown>) => ({
    won: Number(s.won ?? 0) ? 1 : 0,
    p_score: Number(s.p_score ?? 0),
    o_score: Number(s.o_score ?? 0),
    opp: typeof s.opp === "string" ? s.opp : "Opponent",
    elo_delta: Number(s.elo_delta ?? 0),
    streak: Number(s.streak ?? 0),
  }),
  component: ResultPage,
});

function ResultPage() {
  const user = useAuth((s) => s.user);
  const reset = useDuel((s) => s.reset);
  const navigate = useNavigate();
  const { won, p_score, o_score, opp, elo_delta, streak } = Route.useSearch();
  const youScore = useCountUp(p_score);
  const themScore = useCountUp(o_score);
  const [confetti, setConfetti] = useState<{ x: number; d: number; r: number; c: string }[]>([]);

  useEffect(() => {
    if (!won) return;
    const colors = ["#4ade80", "#f59e0b", "#22d3ee", "#f85149"];
    setConfetti(Array.from({ length: 40 }, () => ({
      x: Math.random() * 100, d: 1 + Math.random() * 2, r: Math.random() * 360,
      c: colors[Math.floor(Math.random() * colors.length)],
    })));
  }, [won]);

  if (!user) return <Navigate to="/auth" />;
  const isWin = !!won;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* confetti */}
      {isWin && confetti.map((c, i) => (
        <motion.div
          key={i}
          initial={{ y: -40, opacity: 0, rotate: 0 }}
          animate={{ y: "110vh", opacity: [0, 1, 1, 0], rotate: c.r + 720 }}
          transition={{ duration: 3 + c.d, delay: i * 0.04, repeat: Infinity, repeatDelay: 2 }}
          style={{ left: `${c.x}%`, background: c.c }}
          className="absolute top-0 h-2 w-2 rounded-sm"
        />
      ))}

      <div className="relative max-w-4xl mx-auto p-6 lg:p-10">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 14 }}
            className={`inline-grid place-items-center h-32 w-32 rounded-sm border-2 ${
              isWin ? "border-warning bg-warning/10 neon-ring" : "border-danger bg-danger/10"
            }`}
          >
            {isWin ? (
              <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <Trophy className="h-16 w-16 text-warning" strokeWidth={2} />
              </motion.div>
            ) : (
              <ShieldOff className="h-16 w-16 text-danger" strokeWidth={2} />
            )}
          </motion.div>

          <div className={`mt-6 text-[11px] uppercase tracking-[0.4em] ${isWin ? "text-warning" : "text-danger"}`}>
            // match_complete
          </div>
          <h1 className="mt-2 text-5xl sm:text-7xl font-black tracking-tighter">
            {isWin ? "VICTORY" : "DEFEAT"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            duel vs <span className="text-foreground font-bold">{opp}</span>
          </p>
        </div>

        <Panel title="match.summary">
          <div className="p-6 grid grid-cols-2 gap-6 items-end">
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-widest text-info">you</div>
              <div className="font-mono text-5xl font-black tabular-nums mt-1">{youScore}</div>
              <div className="mt-3 h-2 bg-background border border-border rounded-sm overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(p_score / Math.max(p_score, o_score, 1)) * 100}%` }}
                  transition={{ duration: 1 }}
                  className="h-full bg-info"
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-danger">rival</div>
              <div className="font-mono text-5xl font-black tabular-nums mt-1">{themScore}</div>
              <div className="mt-3 h-2 bg-background border border-border rounded-sm overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(o_score / Math.max(p_score, o_score, 1)) * 100}%` }}
                  transition={{ duration: 1 }}
                  className="h-full bg-danger ml-auto"
                  style={{ marginLeft: "auto" }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 border-t border-hairline divide-x divide-[var(--color-hairline)]">
            <Stat label="elo delta" value={`${elo_delta >= 0 ? "+" : ""}${elo_delta}`} tone={elo_delta >= 0 ? "success" : "danger"} />
            <Stat label="xp earned" value={`+${p_score}`} tone="warning" />
            <Stat label="best streak" value={`${streak}x`} tone="info" icon={<Flame className="h-4 w-4" />} />
          </div>
        </Panel>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TButton
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => { reset(); navigate({ to: "/dashboard/duels" }); }}
          >
            <Zap className="h-4 w-4" /> find next match
          </TButton>
          <TButton
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => { reset(); navigate({ to: "/dashboard" }); }}
          >
            <Home className="h-4 w-4" /> return to command
          </TButton>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone: "success" | "danger" | "warning" | "info"; icon?: React.ReactNode }) {
  const color =
    tone === "success" ? "text-success" :
    tone === "danger" ? "text-danger" :
    tone === "warning" ? "text-warning" : "text-info";
  return (
    <div className="p-5 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1.5 flex items-center justify-center gap-1.5 font-mono text-3xl font-black tabular-nums ${color}`}>
        {icon}{value}
      </div>
    </div>
  );
}
