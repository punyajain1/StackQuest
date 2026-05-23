import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Check, Search, Loader2, Clock } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";
import { useDuel } from "@/lib/duel-store";

export const Route = createFileRoute("/dashboard/duels")({
  head: () => ({
    meta: [
      { title: "Matchmaking — StackQuest" },
      { name: "description", content: "Queue up for a real-time 1v1 coding duel against developers near your ELO." },
    ],
  }),
  component: DuelsPage,
});

const RECENT = [
  { result: "W", opp: "asyncAwaiter", delta: +16, score: "412-268" },
  { result: "L", opp: "kernel_panic", delta: -14, score: "300-388" },
  { result: "W", opp: "semicolon;", delta: +18, score: "490-410" },
  { result: "W", opp: "tabs_over_spaces", delta: +12, score: "350-300" },
  { result: "L", opp: "n00b_destroyer", delta: -10, score: "210-360" },
];

function DuelsPage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const { startMatchmaking, cancelMatchmaking, searching, queuePosition, matchId, opponent, phase } = useDuel();
  const navigate = useNavigate();
  
  const [elapsed, setElapsed] = useState(0);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoadingHistory(true);
    fetch("http://localhost:3000/api/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data.recent_matches) {
          setRecentMatches(json.data.recent_matches.slice(0, 5));
        }
      })
      .catch(err => console.error("Error loading matches:", err))
      .finally(() => setLoadingHistory(false));
  }, [token]);

  const foundOpp = (phase === "vs" || phase === "playing") && opponent
    ? { name: opponent.username, elo: opponent.elo }
    : null;

  useEffect(() => {
    if (!searching) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => window.clearInterval(id);
  }, [searching]);

  useEffect(() => {
    if (phase === "vs" && matchId && opponent) {
      navigate({
        to: "/game/vs-screen",
        search: {
          match_id: matchId,
          opp: opponent.username,
          opp_elo: opponent.elo,
          invited: false
        }
      });
    }
  }, [phase, matchId, opponent, navigate]);

  if (!user) return <Navigate to="/auth" />;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  };

  return (
    <DashboardShell>
      <div className="p-6 lg:p-10 max-w-[1400px]">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">~/dashboard/duels</div>
          <h1 className="text-3xl font-black tracking-tight mt-1">matchmaking_<span className="text-accent">arena</span>()</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          {/* MAIN: queue button */}
          <Panel title="duel.queue">
            <div className="relative p-8 sm:p-12 min-h-[520px] flex flex-col items-center justify-center overflow-hidden">
              {/* radar rings */}
              <AnimatePresence>
                {searching && !foundOpp &&
                  [0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ width: 220, height: 220, opacity: 0.7 }}
                      animate={{ width: 580, height: 580, opacity: 0 }}
                      transition={{ duration: 2.6, delay: i * 0.6, repeat: Infinity, ease: "easeOut" }}
                      className="absolute rounded-full border border-accent pointer-events-none"
                    />
                  ))
                }
              </AnimatePresence>

              {/* center button */}
              <motion.button
                onClick={() => { if (!searching) startMatchmaking(); else cancelMatchmaking(); }}
                disabled={!!foundOpp}
                whileTap={{ scale: 0.95 }}
                animate={searching ? { scale: [1, 1.04, 1] } : {}}
                transition={searching ? { duration: 1.4, repeat: Infinity } : { type: "spring" }}
                className={`relative z-10 h-56 w-56 rounded-full grid place-items-center border-2 tactile transition ${
                  searching
                    ? "border-accent bg-background neon-ring"
                    : "border-foreground bg-foreground text-background hover:bg-accent hover:border-accent hover:text-background"
                }`}
              >
                <div className="text-center">
                  {!searching && (
                    <>
                      <Zap className="h-12 w-12 mx-auto" strokeWidth={2.5} />
                      <div className="mt-3 text-sm uppercase tracking-[0.3em] font-bold">find duel</div>
                    </>
                  )}
                  {searching && !foundOpp && (
                    <>
                      <Search className="h-10 w-10 mx-auto text-accent animate-pulse" />
                      <div className="mt-3 text-sm uppercase tracking-[0.3em] font-bold text-accent">searching</div>
                      <div className="mt-2 font-mono text-2xl tabular-nums text-foreground">{fmt(elapsed)}</div>
                      <div className="mt-1 text-[10px] uppercase text-muted-foreground">scanning pool · queue pos: {queuePosition}</div>
                    </>
                  )}
                  {foundOpp && (
                    <>
                      <Check className="h-10 w-10 mx-auto text-success" />
                      <div className="mt-3 text-sm uppercase tracking-[0.3em] font-bold text-success">match found</div>
                      <div className="mt-1 text-xs text-muted-foreground">vs {foundOpp.name}</div>
                    </>
                  )}
                </div>
              </motion.button>

              <div className="mt-10 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground font-mono">
                <span>region: auto</span>
                <span className="text-border">·</span>
                <span>elo_range: ±100</span>
                <span className="text-border">·</span>
                <span>rounds: 5</span>
              </div>

              {searching && !foundOpp && (
                <button onClick={() => cancelMatchmaking()} className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-danger">
                  <X className="h-3 w-3" /> cancel queue
                </button>
              )}

              <AnimatePresence>
                {foundOpp && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-x-0 bottom-0 border-t border-accent bg-background/95 backdrop-blur p-4 text-center"
                  >
                    <div className="text-[10px] uppercase tracking-[0.3em] text-accent">// match_found</div>
                    <div className="text-base font-bold mt-1">
                      vs <span className="text-danger">{foundOpp.name}</span> ({foundOpp.elo} ELO)
                    </div>
                    <div className="text-[11px] text-muted-foreground">launching vs.screen...</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Panel>

          {/* SIDE: recent history */}
          <div className="space-y-6">
            <Panel title="recent.duels">
              <div className="p-2">
                {user.totalDuels === 0 ? (
                  <div className="text-center py-10 px-4 text-xs text-muted-foreground font-mono">
                    // no recent combats registered.
                  </div>
                ) : loadingHistory ? (
                  <div className="text-xs text-muted-foreground p-3 flex items-center gap-1.5 font-mono">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> downloading telemetry...
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {recentMatches.map((m: any, idx: number) => (
                      <div key={m.match_id || idx} className="flex items-center gap-3 px-3 py-2.5 hover:bg-background/40 transition border-b border-hairline last:border-0 font-mono text-[11px]">
                        <div className={`h-7 w-7 grid place-items-center font-black text-xs rounded-sm shrink-0 border ${
                          m.result === "win" ? "bg-success/15 border-success/40 text-success" : m.result === "loss" ? "bg-danger/15 border-danger/40 text-danger" : "bg-warning/15 border-warning/40 text-warning"
                        }`}>
                          {m.result === "win" ? "W" : m.result === "loss" ? "L" : "D"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate text-foreground">vs {m.opponent_username}</div>
                          <div className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5 shrink-0" />
                            {new Date(m.played_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className={`font-mono text-xs tabular-nums shrink-0 ${m.elo_change >= 0 ? "text-success" : "text-danger"}`}>
                          {m.elo_change >= 0 ? "+" : ""}{m.elo_change} ELO
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
            <TButton variant="outline" className="w-full" onClick={() => navigate({ to: "/dashboard" })}>
              ← back to command
            </TButton>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
