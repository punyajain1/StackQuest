import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth-store";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Trophy, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TButton } from "./TButton";

interface ChallengerInfo {
  id: string;
  username: string;
  elo: number;
  avatar_url: string | null;
}

interface DuelInvite {
  match_id: string;
  challenger: ChallengerInfo;
  tag: string | null;
  rounds: number;
}

export function GlobalDuelInviteListener() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  
  const [invite, setInvite] = useState<DuelInvite | null>(null);
  const [processing, setProcessing] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Only connect if user is authenticated and token is not mock
    if (!token || token.startsWith("mock.")) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io("http://localhost:3000/duel", {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🎮 Global Duel Invite socket established");
    });

    socket.on("duel:invite_received", (data: DuelInvite) => {
      console.log("🎮 Duel Invite Received in web:", data);
      // Play a subtle notify sound if desired, or show a premium toast
      setInvite(data);
    });

    socket.on("duel:invite_declined", () => {
      console.log("🎮 Duel Invite retracted or declined by challenger");
      setInvite(null);
    });

    socket.on("connect_error", (err) => {
      console.warn("Global invite socket connection error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user]);

  const handleDecline = async () => {
    if (!invite || processing) return;
    setProcessing(true);
    try {
      const res = await fetch(`http://localhost:3000/api/duel/${invite.match_id}/reject-invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.info("Duel challenge declined.");
      }
    } catch (err) {
      console.error("Failed to decline invite:", err);
    } finally {
      setProcessing(false);
      setInvite(null);
    }
  };

  const handleAccept = async () => {
    if (!invite || processing) return;
    setProcessing(true);
    try {
      const res = await fetch(`http://localhost:3000/api/duel/${invite.match_id}/accept-invite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Duel invitation accepted! Preparing arena...");
        setInvite(null);
        navigate({
          to: "/game/vs-screen",
          search: {
            match_id: invite.match_id,
            opp: invite.challenger.username,
            opp_elo: invite.challenger.elo,
            invited: false,
          }
        });
      } else {
        toast.error(json.error?.message || "Match expired or was cancelled by opponent.");
        setInvite(null);
      }
    } catch (err) {
      console.error("Failed to accept invite:", err);
      toast.error("Handshake failed. Arena unreachable.");
      setInvite(null);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.95 }}
          className="fixed bottom-6 right-6 z-[99999] max-w-[380px] w-full font-mono text-xs"
        >
          <div className="bg-background/95 backdrop-blur border-2 border-accent/40 rounded-sm shadow-[0_0_50px_rgba(255,215,0,0.15)] overflow-hidden">
            {/* Glowing Accent Top Bar */}
            <div className="h-1 bg-gradient-to-r from-warning via-accent to-warning animate-pulse" />
            
            <div className="p-5 space-y-4">
              {/* Header Title with Swords Icon */}
              <div className="flex items-center gap-2.5 justify-center text-accent text-sm font-black uppercase tracking-wider">
                <Swords className="h-5 w-5 animate-bounce" />
                <span>duel_challenge_received()</span>
              </div>

              {/* Challenger Description Card */}
              <div className="flex items-center gap-4 bg-surface/50 border border-border/80 p-3.5 rounded-sm">
                <img
                  src={invite.challenger.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${invite.challenger.username}`}
                  alt=""
                  className="h-12 w-12 rounded-sm border border-border bg-background"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-foreground truncate">{invite.challenger.username}</div>
                  <div className="flex items-center gap-1 text-[10px] text-accent/80 font-bold uppercase tracking-widest mt-1">
                    <Trophy className="h-3 w-3 shrink-0" />
                    <span>{invite.challenger.elo} ELO</span>
                  </div>
                </div>
              </div>

              {/* Tag detail parameter */}
              {invite.tag && (
                <div className="flex justify-between items-center bg-background/50 border border-hairline/80 px-3.5 py-2 rounded-sm">
                  <span className="text-muted-foreground">match_topic:</span>
                  <span className="bg-info/10 text-info border border-info/30 px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest text-[9px]">
                    {invite.tag}
                  </span>
                </div>
              )}

              {/* Action buttons Accept / Decline */}
              <div className="flex gap-3">
                <TButton
                  variant="outline"
                  disabled={processing}
                  onClick={handleDecline}
                  className="flex-1 text-danger border-danger/40 hover:bg-danger/10 flex items-center justify-center gap-1.5 py-3 font-bold"
                >
                  <X className="h-3.5 w-3.5 text-danger" /> decline
                </TButton>

                <TButton
                  variant="primary"
                  disabled={processing}
                  onClick={handleAccept}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 font-bold text-background"
                >
                  {processing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-background" />
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5 text-background" /> accept_duel
                    </>
                  )}
                </TButton>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
