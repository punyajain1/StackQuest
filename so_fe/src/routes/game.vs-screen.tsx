import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { useDuel } from "@/lib/duel-store";
import { toast } from "sonner";

export const Route = createFileRoute("/game/vs-screen")({
  validateSearch: (s: Record<string, unknown>): { match_id: string; opp: string; opp_elo: number; invited: boolean } => ({
    match_id: typeof s.match_id === "string" ? s.match_id : "",
    opp: typeof s.opp === "string" ? s.opp : "Opponent",
    opp_elo: Number(s.opp_elo ?? 1000),
    invited: s.invited === "true" || s.invited === true,
  }),
  component: VsScreen,
});

function VsScreen() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const duel = useDuel();
  const { match_id, opp, opp_elo, invited } = Route.useSearch();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<"enter" | "collide" | "count" | "waiting">("enter");
  const [count, setCount] = useState(3);
  const [waitingForAccept, setWaitingForAccept] = useState(!!invited);
  const [cancelling, setCancelling] = useState(false);

  // Poll match status when waiting for invite acceptance
  useEffect(() => {
    if (!waitingForAccept || !match_id || !token) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/duel/${match_id}/state`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!active) return;

        if (json.success) {
          const status = json.data.status;
          if (status === "active") {
            clearInterval(interval);
            setWaitingForAccept(false);
          } else if (status === "cancelled") {
            clearInterval(interval);
            toast.error(`${opp} declined the duel challenge.`);
            navigate({ to: "/dashboard/friends" });
          }
        }
      } catch (err) {
        console.error("Error polling match status:", err);
      }
    }, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [waitingForAccept, match_id, token, opp, navigate]);

  // Connect to live duel match
  useEffect(() => {
    if (match_id && !waitingForAccept) {
      duel.joinMatch(match_id);
    }
  }, [match_id, waitingForAccept]);

  // Handle standard VS animations
  useEffect(() => {
    if (waitingForAccept) {
      setPhase("waiting");
      return;
    }
    setPhase("enter");
    const t1 = setTimeout(() => setPhase("collide"), 900);
    const t2 = setTimeout(() => setPhase("count"), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [waitingForAccept]);

  // Countdown timer transitions
  useEffect(() => {
    if (phase !== "count") return;
    if (count <= 0) {
      const t = setTimeout(() => navigate({ to: "/game/duel", search: { match_id } }), 600);
      return () => clearTimeout(t);
    }
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count, match_id, navigate]);

  const handleCancelChallenge = async () => {
    if (cancelling || !match_id) return;
    setCancelling(true);
    try {
      const res = await fetch(`http://localhost:3000/api/duel/${match_id}/reject-invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.info("Challenge cancelled.");
        navigate({ to: "/dashboard/friends" });
      } else {
        toast.error("Failed to cancel challenge.");
      }
    } catch (err) {
      console.error("Cancel challenge error:", err);
      toast.error("Network communication error.");
    } finally {
      setCancelling(false);
    }
  };

  if (!user) return <Navigate to="/auth" />;

  // Display waiting screen if invitation is not accepted yet
  if (waitingForAccept) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background flex flex-col items-center justify-center font-mono text-xs">
        {/* Background Gradients */}
        <div className="absolute inset-0 grid grid-cols-2 pointer-events-none">
          <div className="relative" style={{ background: "linear-gradient(135deg, oklch(0.22 0.07 240), oklch(0.16 0.012 260))" }}>
            <div className="absolute inset-0 dot-grid opacity-20" />
          </div>
          <div className="relative" style={{ background: "linear-gradient(225deg, oklch(0.25 0.18 25), oklch(0.16 0.012 260))" }}>
            <div className="absolute inset-0 dot-grid opacity-20" />
          </div>
        </div>

        {/* Center glowing radar or loader */}
        <div className="relative z-10 text-center max-w-sm w-full p-8 border-2 border-accent/30 bg-background/80 backdrop-blur rounded-sm shadow-[0_0_50px_rgba(255,215,0,0.15)] space-y-6">
          <div className="h-1 bg-accent absolute top-0 left-0 right-0" />
          
          <div className="relative flex justify-center">
            {/* Pulsing radar circles */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ width: 60, height: 60, opacity: 0.6 }}
                animate={{ width: 160, height: 160, opacity: 0 }}
                transition={{ duration: 2, delay: i * 0.6, repeat: Infinity, ease: "easeOut" }}
                className="absolute rounded-full border border-accent/40 pointer-events-none"
              />
            ))}
            <div className="h-16 w-16 bg-surface border border-accent rounded-full grid place-items-center relative z-10 shadow-lg">
              <Swords className="h-7 w-7 text-accent animate-pulse" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-bold text-foreground">CHALLENGING_{opp.toUpperCase()}</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Waiting for the opponent node to accept the combat pipeline request...
            </p>
            <div className="text-[10px] text-accent/80 font-bold uppercase tracking-widest">{opp_elo} ELO</div>
          </div>

          <div className="pt-4 flex justify-center">
            <button
              onClick={handleCancelChallenge}
              disabled={cancelling}
              className="flex items-center justify-center gap-1.5 border border-danger/40 hover:border-danger text-danger bg-danger/5 hover:bg-danger/10 px-6 py-2.5 rounded-sm uppercase tracking-wider font-bold transition disabled:opacity-50 text-[10px]"
            >
              {cancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              cancel_challenge()
            </button>
          </div>
        </div>

        <div className="absolute bottom-6 font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground">
          match_id · {match_id}
        </div>
      </div>
    );
  }

  if (!duel.player || !duel.opponent) {
    return (
      <div className="min-h-screen grid place-items-center font-mono text-xs text-accent uppercase tracking-widest bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-accent" />
          <div>assembling match arena telemetry...</div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      animate={phase === "collide" ? { x: [0, -8, 8, -6, 6, 0], y: [0, 6, -4, 4, -2, 0] } : {}}
      transition={{ duration: 0.5 }}
      className="relative min-h-screen overflow-hidden bg-background"
    >
      {phase === "collide" && (
        <motion.div
          initial={{ opacity: 0.95 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 bg-white z-50 pointer-events-none"
        />
      )}

      <div className="absolute inset-0 grid grid-cols-2">
        <div className="relative" style={{ background: "linear-gradient(135deg, oklch(0.22 0.07 240), oklch(0.16 0.012 260))" }}>
          <div className="absolute inset-0 dot-grid opacity-20" />
        </div>
        <div className="relative" style={{ background: "linear-gradient(225deg, oklch(0.25 0.18 25), oklch(0.16 0.012 260))" }}>
          <div className="absolute inset-0 dot-grid opacity-20" />
        </div>
      </div>

      {/* center beam */}
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.6 }}
        className="absolute left-1/2 -translate-x-1/2 inset-y-0 w-1 bg-gradient-to-b from-warning via-warning to-warning shadow-[0_0_24px_8px_oklch(0.78_0.17_75/0.5)]"
        style={{ transformOrigin: "center" }}
      />

      <div className="relative z-10 grid grid-cols-2 min-h-screen items-center px-8 sm:px-16">
        {/* player 1 (left) */}
        <motion.div
          initial={{ x: "-100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          className="text-center"
        >
          <PlayerCard side="left" name={duel.player.username} avatar={duel.player.avatarUrl} elo={duel.player.elo} accent="info" />
        </motion.div>

        {/* player 2 (right) */}
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          className="text-center"
        >
          <PlayerCard side="right" name={duel.opponent.username} avatar={duel.opponent.avatarUrl} elo={duel.opponent.elo} accent="danger" />
        </motion.div>
      </div>

      {/* VS / countdown */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        {phase !== "count" ? (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 12, delay: 0.4 }}
            className="text-center"
          >
            <div className="font-black text-[10rem] leading-none tracking-tighter text-foreground drop-shadow-[8px_8px_0_rgba(0,0,0,0.6)]">
              VS
            </div>
            <div className="mt-2 flex items-center justify-center gap-2 text-warning text-xs uppercase tracking-[0.4em] font-bold">
              <Swords className="h-4 w-4" /> initializing protocol <Swords className="h-4 w-4" />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={count}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="text-[12rem] leading-none font-black text-accent drop-shadow-[6px_6px_0_rgba(0,0,0,0.5)]">
              {count > 0 ? count : "GO"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
              {count > 0 ? "engaging" : "execute"}
            </div>
          </motion.div>
        )}
      </div>

      <div className="absolute bottom-6 inset-x-0 text-center font-mono text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
        match_id · {match_id}
      </div>
    </motion.div>
  );
}

function PlayerCard({
  side, name, avatar, elo, accent,
}: { side: "left" | "right"; name: string; avatar: string; elo: number; accent: "info" | "danger" }) {
  const color = accent === "info" ? "text-info border-info" : "text-danger border-danger";
  return (
    <div className={side === "left" ? "ml-0 mr-auto text-left" : "ml-auto mr-0 text-right"}>
      <div className={`text-[10px] uppercase tracking-[0.4em] ${color.split(" ")[0]}`}>
        {side === "left" ? "// player_1" : "// player_2"}
      </div>
      <div className={`relative inline-block mt-3 ${side === "right" ? "flex-row-reverse" : ""}`}>
        <div className={`absolute -inset-2 ${accent === "info" ? "bg-info/20" : "bg-danger/20"} blur-2xl`} />
        <img src={avatar} alt="" className={`relative h-32 w-32 rounded-sm border-2 ${color} bg-surface`} />
      </div>
      <h2 className="mt-4 text-4xl font-black tracking-tight">{name}</h2>
      <div className={`mt-1 font-mono tabular-nums text-2xl font-bold ${color.split(" ")[0]}`}>
        {elo} ELO
      </div>
    </div>
  );
}
