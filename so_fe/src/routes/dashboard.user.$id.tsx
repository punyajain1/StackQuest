import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Swords, Zap, Award, Flame, Target, Compass, ChevronLeft, Loader2, Clock, CheckCircle2, XCircle
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/user/$id")({
  head: () => ({
    meta: [
      { title: "Developer Profile — StackQuest" },
      { name: "description", content: "View detailed coding statistics, unlocked milestones, ELO tier standings, and match history." },
    ],
  }),
  component: PublicProfilePage,
});

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  title: string;
  bio: string;
  elo: number;
  xp: number;
  level: number;
  league: string;
  total_duels: number;
  duels_won: number;
  win_rate: number;
  max_streak: number;
  current_streak: number;
  total_games: number;
  achievements_unlocked: number;
  achievements_total: number;
  rank: number;
  league_xp_current: number;
  league_xp_next: number;
  created_at: string;
}

interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  unlocked: boolean;
  unlocked_at: string | null;
}

interface RecentMatch {
  match_id: string;
  opponent_username: string;
  opponent_avatar_url: string | null;
  result: "win" | "loss" | "draw";
  elo_change: number;
  played_at: string;
}

const LEAGUE_COLORS: Record<string, string> = {
  bronze: "text-[#CD7F32] border-[#CD7F32]/40 bg-[#CD7F32]/10",
  silver: "text-[#C0C0C0] border-[#C0C0C0]/40 bg-[#C0C0C0]/10",
  gold: "text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10",
  platinum: "text-[#00D4FF] border-[#00D4FF]/40 bg-[#00D4FF]/10",
  diamond: "text-[#7DF9FF] border-[#7DF9FF]/40 bg-[#7DF9FF]/10",
  master: "text-[#AF52DE] border-[#AF52DE]/40 bg-[#AF52DE]/10",
  legend: "text-[#FF3B30] border-[#FF3B30]/40 bg-[#FF3B30]/10",
};

const LEAGUE_HEX: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#00D4FF",
  diamond: "#7DF9FF",
  master: "#AF52DE",
  legend: "#FF3B30",
};

function PublicProfilePage() {
  const { id } = Route.useParams();
  const token = useAuth((s) => s.token);
  const currentUser = useAuth((s) => s.user);
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [challenging, setChallenging] = useState(false);

  const syncProfile = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Fetch Profile info
      const profileRes = await fetch(`http://localhost:3000/api/users/${id}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileJson = await profileRes.json();
      if (profileJson.success) {
        setProfile(profileJson.data);
      } else {
        toast.error("Failed to load profile metadata.");
        return;
      }

      // 2. Fetch Achievements
      const achRes = await fetch(`http://localhost:3000/api/users/${id}/achievements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const achJson = await achRes.json();
      if (achJson.success) {
        setAchievements(achJson.data);
      }

      // 3. Fetch recent matches for this user by appending to profile or leave empty fallback
      if (profileJson.data && profileJson.data.recent_matches) {
        setRecentMatches(profileJson.data.recent_matches);
      } else {
        setRecentMatches([]);
      }
    } catch (err) {
      console.error("Failed to load public profile telemetry:", err);
      toast.error("Telemetry link failed. Profile offline.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncProfile();
  }, [id, token]);

  if (!currentUser) return <Navigate to="/auth" />;

  const handleChallenge = async () => {
    if (!profile || challenging) return;
    setChallenging(true);
    try {
      const res = await fetch("http://localhost:3000/api/duel/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ opponentId: profile.id }),
      });
      const json = await res.json();
      if (json.success) {
        const match = json.data;
        toast.success(`Challenge dispatch successful! Inviting ${profile.username}`);
        navigate({
          to: "/game/vs-screen",
          search: {
            match_id: match.match_id,
            opp: profile.username,
            opp_elo: profile.elo,
            invited: true,
          }
        });
      } else {
        toast.error(json.error?.message || "Failed to establish combat pipeline.");
      }
    } catch (err) {
      console.error("Challenge duel error:", err);
      toast.error("Network combat interface failure.");
    } finally {
      setChallenging(false);
    }
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="min-h-[70vh] grid place-items-center font-mono text-sm text-accent uppercase tracking-[0.2em]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
            <div>decrypting profile signature...</div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!profile) {
    return (
      <DashboardShell>
        <div className="p-6 lg:p-10 text-center font-mono text-xs text-danger py-24">
          // CRITICAL SYSTEM FAILURE: PROFILE NOT FOUND IN LOCAL REGISTER.
          <div className="mt-4">
            <Link to="/dashboard/friends">
              <TButton variant="outline">← Return to Social Hub</TButton>
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const league = profile.league || "gold";
  const leagueColorClass = LEAGUE_COLORS[league] || LEAGUE_COLORS.gold;
  const leagueHex = LEAGUE_HEX[league] || LEAGUE_HEX.gold;

  return (
    <DashboardShell>
      <div className="p-6 lg:p-10 max-w-[1200px] mx-auto font-mono text-xs">
        
        {/* Navigation / Header */}
        <div className="flex items-center justify-between mb-8">
          <Link to="/dashboard/friends">
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-surface/50 border border-transparent hover:border-border px-3 py-1.5 rounded-sm transition">
              <ChevronLeft className="h-4 w-4" /> back_to_social()
            </button>
          </Link>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">// developer.registry / {profile.username}</div>
        </div>

        {/* Dynamic Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          
          {/* Main Stats Segment */}
          <div className="space-y-6">
            
            {/* Main Profile Card Panel */}
            <Panel title={`registry.card[${profile.username}]`}>
              <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-6 relative">
                {/* Background glow base on league color */}
                <div
                  className="absolute -inset-1 blur-3xl opacity-10 pointer-events-none rounded-full"
                  style={{ backgroundColor: leagueHex }}
                />

                <div className="relative shrink-0 mx-auto md:mx-0">
                  <img
                    src={profile.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${profile.username}`}
                    alt=""
                    className="h-28 w-28 rounded-sm border-2 bg-background shadow-lg"
                    style={{ borderColor: leagueHex }}
                  />
                  <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-black uppercase px-2 py-0.5 rounded-sm">
                    LVL {profile.level}
                  </div>
                </div>

                <div className="flex-1 w-full text-center md:text-left min-w-0">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-foreground">{profile.username}</h1>
                      <div className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed max-w-md">
                        {profile.bio || "// this developer has not compiled a bio yet."}
                      </div>
                    </div>

                    {/* Combat duel button */}
                    <div className="shrink-0 flex justify-center">
                      <TButton
                        variant="primary"
                        disabled={challenging}
                        onClick={handleChallenge}
                        className="shadow-[0_0_15px_rgba(255,215,0,0.15)] flex items-center gap-2 px-6 py-3 font-bold"
                      >
                        {challenging ? (
                          <Loader2 className="h-4 w-4 animate-spin text-background" />
                        ) : (
                          <Swords className="h-4 w-4 text-background" />
                        )}
                        issue_challenge()
                      </TButton>
                    </div>
                  </div>

                  {/* League tags */}
                  <div className="mt-4 flex flex-wrap gap-2.5 justify-center md:justify-start">
                    <span className={`border px-2.5 py-0.5 font-bold uppercase tracking-widest text-[9px] rounded-sm ${leagueColorClass}`}>
                      {league} league
                    </span>
                    <span className="border border-info/40 text-info bg-info/10 px-2.5 py-0.5 font-bold uppercase tracking-widest text-[9px] rounded-sm">
                      {profile.elo} elo
                    </span>
                    <span className="border border-border text-muted-foreground px-2.5 py-0.5 font-bold uppercase tracking-widest text-[9px] rounded-sm">
                      Rank #{profile.rank}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Bar Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-hairline divide-x divide-[var(--color-hairline)] bg-surface/20">
                <div className="p-4.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">duels_won</div>
                  <div className="text-xl font-bold font-mono text-foreground">{profile.duels_won} / {profile.total_duels}</div>
                </div>
                <div className="p-4.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">win_rate</div>
                  <div className="text-xl font-bold font-mono text-success">{Math.round((profile.win_rate || 0) * 100)}%</div>
                </div>
                <div className="p-4.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">max_streak</div>
                  <div className="text-xl font-bold font-mono text-warning flex items-center justify-center gap-0.5">
                    {profile.max_streak}x <Flame className="h-4 w-4 fill-warning text-warning shrink-0" />
                  </div>
                </div>
                <div className="p-4.5 text-center">
                  <div className="text-muted-foreground text-[10px] uppercase tracking-widest mb-1">total_xp</div>
                  <div className="text-xl font-bold font-mono text-info">{profile.xp} XP</div>
                </div>
              </div>
            </Panel>

            {/* Achievements Progression Panel */}
            <Panel title="registry.milestones_accomplished">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>achievements_unlocked</span>
                  <span className="text-foreground font-bold">{profile.achievements_unlocked} / {profile.achievements_total}</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {achievements.map((ach) => (
                    <div
                      key={ach.id}
                      className={`p-3.5 border rounded-sm flex items-start gap-3 transition ${
                        ach.unlocked
                          ? "bg-surface/50 border-border hover:border-foreground"
                          : "bg-background/20 border-hairline/60 opacity-40"
                      }`}
                    >
                      <div
                        className="h-10 w-10 shrink-0 grid place-items-center text-xl rounded-sm border"
                        style={{
                          borderColor: ach.unlocked ? ach.color + "50" : "transparent",
                          backgroundColor: ach.unlocked ? ach.color + "15" : "transparent",
                        }}
                      >
                        {ach.icon}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className={`font-bold text-xs ${ach.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                          {ach.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-relaxed">{ach.description}</div>
                        {ach.unlocked && ach.unlocked_at && (
                          <div className="text-[9px] text-[#00FF00]/60 flex items-center gap-1 font-mono pt-1">
                            <Clock className="h-2.5 w-2.5" /> unlocked {new Date(ach.unlocked_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

          </div>

          {/* Sidebar Panel: Recent Combats */}
          <div className="space-y-6">
            <Panel title="registry.combat_logs">
              <div className="p-2 min-h-[300px]">
                {recentMatches.length === 0 ? (
                  <div className="text-center py-20 px-4 text-muted-foreground">
                    // no combat session telemetry found.
                  </div>
                ) : (
                  recentMatches.map((m, idx) => (
                    <div
                      key={m.match_id || idx}
                      className="flex items-center gap-3.5 px-3.5 py-3 hover:bg-surface/40 transition rounded-sm border-b border-hairline last:border-b-0"
                    >
                      <div
                        className={`h-7 w-7 grid place-items-center font-black text-[10px] rounded-sm shrink-0 border ${
                          m.result === "win"
                            ? "bg-success/15 border-success/40 text-success"
                            : m.result === "loss"
                            ? "bg-danger/15 border-danger/40 text-danger"
                            : "bg-warning/15 border-warning/40 text-warning"
                        }`}
                      >
                        {m.result === "win" ? "W" : m.result === "loss" ? "L" : "D"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate text-foreground hover:text-accent transition">
                          vs {m.opponent_username}
                        </div>
                        <div className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          {new Date(m.played_at).toLocaleDateString()}
                        </div>
                      </div>

                      <div
                        className={`font-mono font-bold tabular-nums text-right ${
                          m.elo_change >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {m.elo_change >= 0 ? "+" : ""}
                        {m.elo_change} ELO
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
            
            {/* System Info Panel */}
            <Panel title="system.telemetry">
              <div className="p-4 space-y-2.5 text-muted-foreground leading-relaxed text-[11px]">
                <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                  <span>registry_id:</span>
                  <span className="font-bold text-foreground font-mono text-[10px] truncate max-w-[180px]">{profile.id}</span>
                </div>
                <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                  <span>established:</span>
                  <span className="text-foreground">{new Date(profile.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between border-b border-hairline/40 pb-1.5">
                  <span>global_standing:</span>
                  <span className="text-foreground">top {profile.rank} developer node</span>
                </div>
              </div>
            </Panel>
          </div>

        </div>

      </div>
    </DashboardShell>
  );
}
