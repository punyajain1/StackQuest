import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Calendar, Zap, BookOpen, Crown, Medal, Filter, Search, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/dashboard/leaderboard")({
  head: () => ({
    meta: [
      { title: "Global Leaderboards — StackQuest" },
      { name: "description", content: "Check out active standings, weekly podiums, and top players across various languages and duels." },
    ],
  }),
  component: LeaderboardPage,
});

interface LeaderRowData {
  rank: number;
  username: string;
  score: number;
  mode: string;
  tag: string | null;
  date: string;
}

type Period = "all_time" | "weekly";
type GameModeFilter = "all" | "duel" | "daily_challenge" | "puzzle";

function LeaderboardPage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);

  const [period, setPeriod] = useState<Period>("all_time");
  const [mode, setMode] = useState<GameModeFilter>("all");
  const [tagInput, setTagInput] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [rows, setRows] = useState<LeaderRowData[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch rankings from live backend API
  useEffect(() => {
    let active = true;
    const fetchRankings = async () => {
      setLoading(true);
      try {
        let url = `http://localhost:3000/api/scores/leaderboard?period=${period}&limit=50`;
        if (mode !== "all") {
          url += `&mode=${mode}`;
        }
        if (tagFilter) {
          url += `&tag=${encodeURIComponent(tagFilter.toLowerCase())}`;
        }

        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(url, { headers });
        const json = await res.json();
        
        if (active && json.success) {
          setRows(json.data);
        }
      } catch (err) {
        console.error("Failed to load rankings:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchRankings();
    return () => {
      active = false;
    };
  }, [period, mode, tagFilter, token]);

  if (!user) return <Navigate to="/auth" />;

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-warning" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-warning/50" />;
    return <span className="font-mono text-xs font-bold text-muted-foreground w-5 text-center">{rank}</span>;
  };

  const getModeIcon = (m: string) => {
    if (m === "duel") return <Zap className="h-3.5 w-3.5 text-danger" />;
    if (m === "daily_challenge") return <Calendar className="h-3.5 w-3.5 text-warning" />;
    return <BookOpen className="h-3.5 w-3.5 text-info" />;
  };

  const formatModeName = (m: string) => {
    if (m === "duel") return "DUEL";
    if (m === "daily_challenge") return "DAILY";
    return "PUZZLE";
  };

  return (
    <DashboardShell>
      <div className="p-6 lg:p-10 max-w-[1400px]">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">~/dashboard/leaderboards</div>
          <h1 className="text-3xl font-black tracking-tight mt-1">global_<span className="text-accent">leaderboards</span>()</h1>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-8 items-start">
          
          {/* LEFT PANEL: Filters */}
          <Panel title="leaderboard.filter">
            <div className="p-5 space-y-6">
              
              {/* Period Picker */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5 font-mono">
                  <Filter className="h-3 w-3" /> period_range
                </div>
                <div className="grid grid-cols-2 border border-border rounded-sm overflow-hidden font-mono">
                  <button
                    onClick={() => setPeriod("all_time")}
                    className={`py-1.5 text-[11px] uppercase tracking-widest text-center transition ${
                      period === "all_time" ? "bg-foreground text-background font-bold" : "bg-surface hover:text-foreground text-muted-foreground"
                    }`}
                  >
                    all_time
                  </button>
                  <button
                    onClick={() => setPeriod("weekly")}
                    className={`py-1.5 text-[11px] uppercase tracking-widest text-center transition ${
                      period === "weekly" ? "bg-foreground text-background font-bold" : "bg-surface hover:text-foreground text-muted-foreground"
                    }`}
                  >
                    weekly
                  </button>
                </div>
              </div>

              {/* Game Mode Selector */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 font-mono">
                  // mode_filter
                </div>
                <div className="space-y-1 font-mono">
                  {(["all", "duel", "daily_challenge", "puzzle"] as GameModeFilter[]).map((m) => {
                    const active = mode === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`w-full text-left px-3 py-2 text-xs uppercase tracking-wider rounded-sm transition border ${
                          active
                            ? "bg-surface border-accent text-accent shadow-[0_0_10px_rgba(var(--color-accent),0.1)]"
                            : "bg-transparent border-transparent hover:bg-surface/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "all" ? "› all categories" : m === "duel" ? "› competitive duels" : m === "daily_challenge" ? "› daily challenges" : "› solo puzzles"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tag Search */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1 font-mono">
                  <Search className="h-3 w-3" /> filter_tag
                </div>
                <form
                  onSubmit={(e) => { e.preventDefault(); setTagFilter(tagInput.trim()); }}
                  className="flex gap-2 font-mono"
                >
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g. reactjs, python"
                    className="flex-1 bg-background border border-border rounded-sm px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                  <TButton variant="outline" size="sm" type="submit">
                    go
                  </TButton>
                </form>
                {tagFilter && (
                  <div className="mt-2 flex items-center justify-between text-[10px] bg-accent/15 border border-accent/30 text-accent px-2 py-1 rounded-sm font-mono">
                    <span>tag: {tagFilter}</span>
                    <button
                      onClick={() => { setTagInput(""); setTagFilter(""); }}
                      className="hover:text-danger font-bold ml-2"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

            </div>
          </Panel>

          {/* RIGHT PANEL: Standings Table */}
          <Panel title="leaderboard.standings">
            <div className="min-h-[580px] p-4 relative overflow-x-auto">
              
              {loading ? (
                <div className="absolute inset-0 grid place-items-center bg-background/20 backdrop-blur-sm z-20">
                  <div className="text-center font-mono text-sm text-accent uppercase tracking-widest flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> syncing rank indices...
                  </div>
                </div>
              ) : null}

              <table className="w-full border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-hairline text-left text-muted-foreground uppercase tracking-widest text-[10px]">
                    <th className="pb-3 pl-3 w-16 text-center">Rank</th>
                    <th className="pb-3 pl-3">Player</th>
                    <th className="pb-3 text-center w-24 hidden sm:table-cell">Mode</th>
                    <th className="pb-3 text-center w-28 hidden sm:table-cell">Subject</th>
                    <th className="pb-3 text-right pr-4 w-32">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-hairline)]">
                  <AnimatePresence mode="popLayout">
                    {rows.length === 0 && !loading ? (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-muted-foreground">
                          // no data compiled in this index stack.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, idx) => {
                        const isSelf = row.username === user.username;
                        return (
                          <motion.tr
                            key={`${row.username}:${idx}`}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.4) }}
                            className={`hover:bg-background/30 transition ${
                              isSelf ? "bg-accent/5 border-x-2 border-accent" : ""
                            }`}
                          >
                            <td className="py-3 text-center pl-3">
                              <div className="flex justify-center">{getRankIcon(row.rank)}</div>
                            </td>
                            <td className="py-3 pl-3 font-bold">
                              <div className="flex items-center gap-2">
                                <img
                                  src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${row.username}`}
                                  alt=""
                                  className="h-6 w-6 rounded-sm border border-border bg-surface shrink-0"
                                />
                                <span className={isSelf ? "text-accent" : ""}>{row.username}</span>
                                {isSelf && (
                                  <span className="text-[9px] uppercase border border-accent/40 text-accent/80 px-1 rounded-sm">YOU</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-center text-muted-foreground hidden sm:table-cell">
                              <div className="flex items-center justify-center gap-1">
                                {getModeIcon(row.mode)}
                                <span className="text-[10px] tracking-wide">{formatModeName(row.mode)}</span>
                              </div>
                            </td>
                            <td className="py-3 text-center hidden sm:table-cell">
                              <span className="bg-surface border border-border px-2 py-0.5 rounded-sm text-[10px] text-foreground/80 lowercase">
                                #{row.tag || "general"}
                              </span>
                            </td>
                            <td className="py-3 text-right pr-4 font-black text-foreground/90 tabular-nums">
                              {row.score.toLocaleString()} XP
                            </td>
                          </motion.tr>
                        );
                      })
                    )}
                  </AnimatePresence>
                </tbody>
              </table>

            </div>
          </Panel>

        </div>
      </div>
    </DashboardShell>
  );
}
