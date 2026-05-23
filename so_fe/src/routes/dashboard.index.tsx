import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Calendar, BookOpenCheck, Flame, Trophy, Swords, Crown, Medal, ChevronRight, TrendingUp, Users, X, Loader2, Clock
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Panel } from "@/components/Panel";
import { useAuth, computeLevel, xpForLevel } from "@/lib/auth-store";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Command Center — StackQuest" },
      { name: "description", content: "Your StackQuest dashboard: stats, leaderboard standing, and access to live duel arenas." },
    ],
  }),
  component: DashboardPage,
});

const LEADERS = [
  { rank: 1, name: "asyncAwaiter", elo: 2814, style: "bottts" },
  { rank: 2, name: "kernel_panic", elo: 2680, style: "adventurer" },
  { rank: 3, name: "semicolon;", elo: 2541, style: "pixel-art" },
];

function DashboardPage() {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/auth" />;
  if (!user.onboarded) return <Navigate to="/onboarding" />;

  const token = useAuth((s) => s.token);
  const fetchUserProfile = useAuth((s) => s.fetchUserProfile);
  const syncProfileWithBackend = useAuth((s) => s.syncProfileWithBackend);

  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [editBioOpen, setEditBioOpen] = useState(false);
  const [bioInput, setBioInput] = useState(user.bio || "");
  const [savingBio, setSavingBio] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchUserProfile();

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

  const level = computeLevel(user.totalXp);
  const xpThis = xpForLevel(level);
  const xpNext = xpForLevel(level + 1);
  const progress = ((user.totalXp - xpThis) / (xpNext - xpThis)) * 100;
  const winRate = user.totalDuels > 0 ? Math.round((user.wins / user.totalDuels) * 100) : 0;

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1400px]">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">~/dashboard</div>
            <h1 className="text-3xl font-black tracking-tight mt-1">
              gm, <span className="text-accent">{user.username}</span>_
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-3 font-mono text-[11px]">
            <Pill tone="success" label="online" />
            <Pill tone="info" label={`${user.elo} elo`} />
            <Pill tone="warning" label={`lvl ${level}`} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          {/* center column */}
          <div className="space-y-6 min-w-0">
            {/* profile card */}
            <Panel title="player.profile" header={<span>uptime · 04:21:08</span>}>
              <div className="p-6 flex flex-col sm:flex-row items-start gap-6">
                <div className="relative">
                  <div className="absolute -inset-1 bg-accent/20 blur-xl" />
                  <img
                     src={user.avatarUrl}
                     alt=""
                     className="relative h-24 w-24 rounded-sm border-2 border-accent bg-background"
                  />
                  <div className="absolute -bottom-2 -right-2 bg-foreground text-background text-[10px] font-black px-1.5 py-0.5 rounded-sm">
                    LVL {level}
                  </div>
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-bold truncate">{user.username}</h2>
                    {user.isGuest && (
                      <span className="text-[10px] uppercase border border-warning text-warning px-1.5 py-0.5">guest</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">{user.bio || "// no bio compiled"}</p>
                    <button
                      onClick={() => { setBioInput(user.bio || ""); setEditBioOpen(true); }}
                      className="text-[9px] uppercase text-accent hover:underline border border-accent/20 hover:border-accent bg-accent/5 hover:bg-accent/15 px-1.5 py-0.5 rounded-sm transition font-mono shrink-0"
                    >
                      edit_bio()
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                      <span>league_xp</span>
                      <span className="tabular-nums">{user.totalXp} / {xpNext} XP</span>
                    </div>
                    <div className="h-2 bg-background border border-border rounded-sm overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-success to-accent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-hairline divide-x divide-[var(--color-hairline)]">
                <StatCard icon={Swords} label="duels" value={String(user.totalDuels)} tone="default" />
                <StatCard icon={TrendingUp} label="win rate" value={`${winRate}%`} tone="info" />
                <StatCard icon={Flame} label="max streak" value={`${user.maxStreak}x`} tone="warning" />
                <StatCard icon={Trophy} label="lifetime xp" value={String(user.totalXp)} tone="success" />
              </div>
            </Panel>

            {/* arena gateways */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
                // game modules
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ArenaCard
                  to="/dashboard/duels"
                  title="Sprint Duels"
                  subtitle="1v1 · real-time · 5 rounds"
                  glyph={<Zap className="h-7 w-7" strokeWidth={2.5} />}
                  tag="HOT"
                  accent="danger"
                  primary
                />
                <ArenaCard
                  to="/game/daily"
                  title="Daily Challenge"
                  subtitle="solo · resets daily"
                  glyph={<Calendar className="h-7 w-7" strokeWidth={2.2} />}
                  tag="+250 XP"
                  accent="warning"
                />
                <ArenaCard
                  to="/dashboard/puzzles"
                  title="Puzzle Library"
                  subtitle="200+ untimed problems"
                  glyph={<BookOpenCheck className="h-7 w-7" strokeWidth={2.2} />}
                  tag="∞"
                  accent="info"
                />
                <ArenaCard
                  to="/dashboard/friends"
                  title="Social Terminal"
                  subtitle="add & manage friends"
                  glyph={<Users className="h-7 w-7" strokeWidth={2.2} />}
                  tag="SOCIAL"
                  accent="info"
                />
              </div>
            </div>
          </div>

          {/* right column: leaderboard */}
          <div className="space-y-6">
            <Panel title="leaderboard.spotlight" header={<span>top_3</span>}>
              <div className="p-4 space-y-2">
                {LEADERS.map((p) => (
                  <LeaderRow key={p.rank} {...p} />
                ))}
                <Link to="/dashboard/leaderboard" className="w-full mt-2 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-accent flex items-center justify-center gap-1 py-2 border border-dashed border-border rounded-sm font-mono">
                  view full leaderboard <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </Panel>

            <Panel title="match.history" header={<span>last_5</span>}>
              <div className="p-2">
                {user.totalDuels === 0 ? (
                  <div className="text-center py-10 px-4 text-xs text-muted-foreground font-mono">
                    // no duels logged.
                    <br />
                    <span className="text-accent">$ ./duel --start</span>
                  </div>
                ) : loadingHistory ? (
                  <div className="text-xs text-muted-foreground p-3 flex items-center gap-1.5 font-mono">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> loading match telemetry...
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {recentMatches.map((m: any, idx: number) => (
                      <div key={m.match_id || idx} className="flex items-center gap-3 px-3 py-2.5 hover:bg-background/40 transition border-b border-hairline last:border-0 font-mono text-[11px]">
                        <div className={`h-6 w-6 grid place-items-center font-black text-[9px] border rounded-sm shrink-0 ${
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
                        <div className={`font-bold tabular-nums shrink-0 ${m.elo_change >= 0 ? "text-success" : "text-danger"}`}>
                          {m.elo_change >= 0 ? "+" : ""}{m.elo_change} ELO
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {/* Sleek Edit Bio Modal */}
      <AnimatePresence>
        {editBioOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditBioOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-md w-full bg-background border-2 border-accent/40 rounded-sm shadow-[0_0_50px_rgba(255,215,0,0.15)] font-mono text-xs overflow-hidden"
            >
              <div className="h-1 bg-accent" />
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                  <div className="text-sm font-bold text-accent uppercase tracking-wider">update_biography()</div>
                  <button onClick={() => setEditBioOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    › edit bio parameters
                  </div>
                  <textarea
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder="Describe your coding persona..."
                    rows={4}
                    maxLength={160}
                    className="w-full bg-surface border border-border focus:border-accent p-3 font-mono text-xs focus:outline-none resize-none"
                  />
                  <div className="text-right text-[9px] text-muted-foreground">
                    {bioInput.length} / 160 characters
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditBioOpen(false)}
                    className="flex-1 bg-surface border border-border hover:border-foreground text-foreground px-4 py-2.5 rounded-sm font-bold uppercase transition"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingBio}
                    onClick={async () => {
                      setSavingBio(true);
                      try {
                        await syncProfileWithBackend({ bio: bioInput });
                        toast.success("Profile bio updated successfully!");
                        setEditBioOpen(false);
                      } catch (err: any) {
                        toast.error(err.message || "Failed to update profile.");
                      } finally {
                        setSavingBio(false);
                      }
                    }}
                    className="flex-1 bg-accent border border-accent text-background px-4 py-2.5 rounded-sm font-bold uppercase transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {savingBio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "deploy()"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

function Pill({ tone, label }: { tone: "success" | "info" | "warning"; label: string }) {
  const cls = tone === "success" ? "border-success text-success" : tone === "info" ? "border-info text-info" : "border-warning text-warning";
  return (
    <span className={`uppercase border ${cls} px-2 py-1 rounded-sm bg-surface/60`}>
      {label}
    </span>
  );
}

function StatCard({
  icon: Icon, label, value, tone,
}: { icon: typeof Zap; label: string; value: string; tone: "default" | "info" | "warning" | "success" }) {
  const color = tone === "info" ? "text-info" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="p-4 hover:bg-background/40 transition">
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-black font-mono tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function ArenaCard({
  to, title, subtitle, glyph, tag, accent, primary,
}: {
  to?: string; title: string; subtitle: string; glyph: React.ReactNode; tag: string;
  accent: "danger" | "warning" | "info"; primary?: boolean;
}) {
  const accentColor =
    accent === "danger" ? "text-danger border-danger" :
    accent === "warning" ? "text-warning border-warning" :
    "text-info border-info";

  const inner = (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className={`relative overflow-hidden p-5 rounded-sm border bg-surface tactile h-full cursor-pointer ${
        primary ? "border-foreground" : "border-border hover:border-foreground"
      }`}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-foreground/5 blur-2xl" />
      <div className="flex items-start justify-between">
        <div className={accent === "danger" ? "text-danger" : accent === "warning" ? "text-warning" : "text-info"}>
          {glyph}
        </div>
        <span className={`text-[10px] font-black uppercase tracking-widest border px-1.5 py-0.5 ${accentColor} ${
          accent === "danger" ? "animate-pulse" : ""
        }`}>
          {tag}
        </span>
      </div>
      <div className="mt-6">
        <div className="text-lg font-bold">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
      <div className={`mt-4 flex items-center gap-1 text-[11px] uppercase tracking-widest font-bold ${
        primary ? "text-accent" : "text-muted-foreground"
      }`}>
        enter arena <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </motion.div>
  );

  if (to) return <Link to={to}>{inner}</Link>;
  return inner;
}

function LeaderRow({ rank, name, elo, style }: { rank: number; name: string; elo: number; style: string }) {
  const trophy = rank === 1 ? <Crown className="h-5 w-5 text-warning" /> : rank === 2 ? <Medal className="h-5 w-5 text-muted-foreground" /> : <Medal className="h-5 w-5 text-warning/60" />;
  const rankBg = rank === 1 ? "bg-warning/10 border-warning/40" : "bg-background border-border";
  return (
    <div className={`flex items-center gap-3 p-2.5 border ${rankBg} rounded-sm`}>
      <div className="font-black font-mono text-lg w-6 text-center text-muted-foreground">{rank}</div>
      {trophy}
      <img src={`https://api.dicebear.com/7.x/${style}/svg?seed=${name}`} alt="" className="h-8 w-8 rounded-sm border border-border bg-surface" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold truncate">{name}</div>
        <div className="text-[10px] text-muted-foreground">{elo} ELO</div>
      </div>
    </div>
  );
}
