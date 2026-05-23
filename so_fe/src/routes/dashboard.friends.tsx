import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, Check, X, Loader2, Trash, Activity, ShieldAlert, Sparkles, Mail, Send, Compass, UserMinus, Clock, Swords
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/friends")({
  head: () => ({
    meta: [
      { title: "Social Terminal — StackQuest" },
      { name: "description", content: "Connect with developers, coordinate duels, search profiles, and manage friend requests in real-time." },
    ],
  }),
  component: FriendsPage,
});

interface Friend {
  friendship_id: string;
  user_id: string;
  username: string;
  avatar_url: string;
  elo: number;
  league: string;
  last_active: string;
}

type TabType = "friends" | "requests";

function FriendsPage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  // Add friend form input
  const [usernameInput, setUsernameInput] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [challengingId, setChallengingId] = useState<string | null>(null);

  const handleChallengeFriend = async (friendId: string, friendName: string, friendElo: number) => {
    if (challengingId) return;
    setChallengingId(friendId);
    try {
      const res = await fetch("http://localhost:3000/api/duel/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ opponentId: friendId }),
      });
      const json = await res.json();
      if (json.success) {
        const match = json.data;
        toast.success(`Challenge dispatch successful! Inviting ${friendName}`);
        navigate({
          to: "/game/vs-screen",
          search: {
            match_id: match.match_id,
            opp: friendName,
            opp_elo: friendElo,
            invited: true,
          }
        });
      } else {
        toast.error(json.error?.message || "Failed to establish combat pipeline.");
      }
    } catch (err) {
      console.error("Challenge error:", err);
      toast.error("Network combat interface failure.");
    } finally {
      setChallengingId(null);
    }
  };

  // Syncing lists from live backend REST endpoints
  const syncSocialHub = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Fetch Friends
      const friendsRes = await fetch("http://localhost:3000/api/friends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const friendsJson = await friendsRes.json();
      if (friendsJson.success) {
        setFriends(friendsJson.data);
      }

      // 2. Fetch Pending
      const pendingRes = await fetch("http://localhost:3000/api/friends/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pendingJson = await pendingRes.json();
      if (pendingJson.success) {
        setPending(pendingJson.data);
      }
    } catch (err) {
      console.error("Failed to sync social hub telemetry:", err);
      toast.error("Telemetry sync failed. Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncSocialHub();
  }, [token]);

  if (!user) return <Navigate to="/auth" />;

  // Handlers
  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = usernameInput.trim();
    if (!cleanName) return;

    if (cleanName.toLowerCase() === user.username.toLowerCase()) {
      toast.error("Error: Loopback request detected. Cannot add self.");
      return;
    }

    setSendingRequest(true);
    try {
      const res = await fetch("http://localhost:3000/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: cleanName }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Request dispatched to ${cleanName}!`);
        setUsernameInput("");
        await syncSocialHub();
      } else {
        toast.error(json.error?.message || "Failed to dispatch friend request.");
      }
    } catch (err) {
      console.error("Friend request error:", err);
      toast.error("Network interface error occurred.");
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (friendshipId: string, name: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/friends/${friendshipId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Friendship established with ${name}!`);
        await syncSocialHub();
      } else {
        toast.error(json.error?.message || "Failed to accept request.");
      }
    } catch (err) {
      console.error("Accept friend error:", err);
      toast.error("Network handshake failure.");
    }
  };

  const handleRejectRequest = async (friendshipId: string, name: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/friends/${friendshipId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Declined request from ${name}.`);
        await syncSocialHub();
      } else {
        toast.error(json.error?.message || "Failed to decline request.");
      }
    } catch (err) {
      console.error("Reject friend error:", err);
      toast.error("Network handshake failure.");
    }
  };

  const handleRemoveFriend = async (friendshipId: string, name: string) => {
    if (!confirm(`Are you sure you want to terminate connection with ${name}?`)) return;

    try {
      const res = await fetch(`http://localhost:3000/api/friends/${friendshipId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Connection closed with ${name}.`);
        await syncSocialHub();
      } else {
        toast.error(json.error?.message || "Failed to terminate connection.");
      }
    } catch (err) {
      console.error("Delete friend error:", err);
      toast.error("Network handshake failure.");
    }
  };

  const getCleanTime = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const isOnline = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    return diffMs < 60000; // active within the last 60 seconds
  };

  return (
    <DashboardShell>
      <div className="p-6 lg:p-10 max-w-[1400px]">
        {/* Header */}
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">~/dashboard/social</div>
          <h1 className="text-3xl font-black tracking-tight mt-1 flex items-center gap-2">
            social_<span className="text-accent">terminal</span>()
          </h1>
        </div>

        {/* main split portal */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8 items-start">
          
          {/* Left panel: Social directory tabs */}
          <div className="space-y-6">
            
            {/* Tabs control bar */}
            <div className="flex border-b border-hairline font-mono text-xs select-none">
              <button
                onClick={() => setActiveTab("friends")}
                className={`px-6 py-3 border-t-2 font-bold uppercase tracking-widest transition duration-150 flex items-center gap-2 ${
                  activeTab === "friends"
                    ? "border-accent bg-surface text-accent shadow-[inset_0_-2px_0_bg-surface]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-surface/30"
                }`}
              >
                <Users className="h-4 w-4" />
                directory [{friends.length}]
              </button>
              <button
                onClick={() => setActiveTab("requests")}
                className={`px-6 py-3 border-t-2 font-bold uppercase tracking-widest transition duration-150 flex items-center gap-2 relative ${
                  activeTab === "requests"
                    ? "border-accent bg-surface text-accent shadow-[inset_0_-2px_0_bg-surface]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-surface/30"
                }`}
              >
                <Mail className="h-4 w-4" />
                requests
                {pending.length > 0 && (
                  <span className="inline-grid place-items-center bg-danger text-background text-[9px] font-black h-4 w-4 rounded-full ml-1 animate-pulse">
                    {pending.length}
                  </span>
                )}
              </button>
            </div>

            {/* List panel */}
            <Panel title={`social.${activeTab}_records`}>
              <div className="p-4 min-h-[460px] relative font-mono text-xs">
                
                {/* Syncing Overlay */}
                {loading && (
                  <div className="absolute inset-0 grid place-items-center bg-background/25 backdrop-blur-sm z-20">
                    <div className="text-center font-mono text-sm text-accent uppercase tracking-widest flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> downloading network nodes...
                    </div>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  
                  {/* DIRECTORY VIEW */}
                  {activeTab === "friends" && (
                    <motion.div
                      key="friends-list"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      {friends.length === 0 && !loading ? (
                        <div className="text-center py-24 px-4 text-muted-foreground">
                          <Users className="h-10 w-10 mx-auto opacity-20 mb-3 text-muted-foreground" />
                          // no connected nodes found in directory database.
                          <div className="mt-2 text-[10px] text-accent">$ add_friend_by_codename &lt;name&gt;</div>
                        </div>
                      ) : (
                        friends.map((friend) => {
                          const online = isOnline(friend.last_active);
                          return (
                            <div
                              key={friend.friendship_id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border border-border bg-surface/50 hover:bg-surface transition rounded-sm gap-4"
                            >
                              <div className="flex items-center gap-3">
                                <Link
                                  to="/dashboard/user/$id"
                                  params={{ id: friend.user_id }}
                                  className="relative shrink-0 block hover:opacity-80 transition"
                                >
                                  <img
                                    src={friend.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${friend.username}`}
                                    alt=""
                                    className="h-10 w-10 border border-border bg-background rounded-sm"
                                  />
                                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                                    {online ? (
                                      <>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-success border border-background" />
                                      </>
                                    ) : (
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-muted-foreground border border-background" />
                                    )}
                                  </span>
                                </Link>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                      to="/dashboard/user/$id"
                                      params={{ id: friend.user_id }}
                                      className="font-bold text-sm text-foreground hover:text-accent hover:underline transition"
                                    >
                                      {friend.username}
                                    </Link>
                                    <span className="bg-background border border-border text-[9px] uppercase px-1.5 py-0.5 text-muted-foreground">
                                      {friend.league}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-3">
                                    <span>{friend.elo} ELO</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3 shrink-0" />
                                      {online ? "active now" : `last seen ${getCleanTime(friend.last_active)}`}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 font-mono sm:self-center">
                                {online && (
                                  <TButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleChallengeFriend(friend.user_id, friend.username, friend.elo)}
                                    disabled={challengingId !== null}
                                    className="shadow-[0_0_10px_rgba(255,215,0,0.15)] flex items-center gap-1 text-[11px]"
                                  >
                                    <Swords className="h-3.5 w-3.5 text-background" /> duel()
                                  </TButton>
                                )}
                                <TButton
                                  variant="outline"
                                  size="sm"
                                  className="text-danger hover:text-danger hover:bg-danger/10 border-danger/40 text-[11px]"
                                  onClick={() => handleRemoveFriend(friend.friendship_id, friend.username)}
                                >
                                  <UserMinus className="h-3.5 w-3.5" /> terminate_node()
                                </TButton>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </motion.div>
                  )}

                  {/* REQUESTS VIEW */}
                  {activeTab === "requests" && (
                    <motion.div
                      key="pending-list"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      {pending.length === 0 && !loading ? (
                        <div className="text-center py-24 px-4 text-muted-foreground">
                          <Mail className="h-10 w-10 mx-auto opacity-20 mb-3 text-muted-foreground" />
                          // inbox empty. no incoming connection pipelines.
                        </div>
                      ) : (
                        pending.map((req) => (
                          <div
                            key={req.friendship_id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border border-border bg-surface/50 hover:bg-surface transition rounded-sm gap-4"
                          >
                            <div className="flex items-center gap-3">
                              <Link
                                to="/dashboard/user/$id"
                                params={{ id: req.user_id }}
                                className="relative shrink-0 block hover:opacity-80 transition"
                              >
                                <img
                                  src={req.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${req.username}`}
                                  alt=""
                                  className="h-10 w-10 border border-border bg-background rounded-sm shrink-0"
                                />
                              </Link>
                              <div className="min-w-0">
                                <Link
                                  to="/dashboard/user/$id"
                                  params={{ id: req.user_id }}
                                  className="text-sm font-bold text-foreground hover:text-accent hover:underline transition"
                                >
                                  {req.username}
                                </Link>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {req.elo} ELO · incoming request
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:self-center">
                              <TButton
                                variant="primary"
                                size="sm"
                                onClick={() => handleAcceptRequest(req.friendship_id, req.username)}
                              >
                                <Check className="h-3.5 w-3.5" /> accept
                              </TButton>
                              <TButton
                                variant="outline"
                                size="sm"
                                className="text-danger hover:bg-danger/10 border-danger/40"
                                onClick={() => handleRejectRequest(req.friendship_id, req.username)}
                              >
                                <X className="h-3.5 w-3.5" /> decline
                              </TButton>
                            </div>
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}

                </AnimatePresence>

              </div>
            </Panel>

          </div>

          {/* Right panel: Controls and instruction guidelines */}
          <div className="space-y-6">
            
            {/* Form panel: add node */}
            <Panel title="social.establish_connection">
              <div className="p-5 font-mono text-xs space-y-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-accent" /> add_friend_by_codename
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Establish a real-time tracking pipeline with other developers by searching for their unique console codename handle below.
                </p>

                <form onSubmit={handleSendRequest} className="space-y-3 pt-2">
                  <div className="relative bg-background border border-border focus-within:border-accent rounded-sm transition">
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline text-[9px] uppercase tracking-widest text-muted-foreground">
                      › input codename
                    </div>
                    <div className="flex items-center px-3 py-2">
                      <span className="text-accent font-bold mr-1.5 font-mono">$</span>
                      <input
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="type username..."
                        className="flex-1 bg-transparent font-mono text-xs focus:outline-none placeholder:opacity-50"
                        disabled={sendingRequest}
                      />
                    </div>
                  </div>

                  <TButton
                    variant="primary"
                    className="w-full flex items-center justify-center gap-2"
                    type="submit"
                    disabled={sendingRequest || !usernameInput.trim()}
                  >
                    {sendingRequest ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    establish_pipeline()
                  </TButton>
                </form>
              </div>
            </Panel>

            {/* Instruction manual */}
            <Panel title="social.protocol_directives">
              <div className="p-5 font-mono text-xs space-y-3.5">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-warning" /> developer_rules
                </div>
                <ul className="space-y-2.5 text-muted-foreground text-[11px] leading-relaxed list-none pl-0">
                  <li className="flex gap-2">
                    <span className="text-accent">01.</span>
                    <span>Accepted friends show up instantly in the **matchmaking system** if you queue up at the same time.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">02.</span>
                    <span>Connected developers will display a **pulsing green state** node whenever they are actively running tasks on StackQuest.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">03.</span>
                    <span>To search for a user profile, make sure to query their exact **case-insensitive** username codename in the connection prompt.</span>
                  </li>
                </ul>
              </div>
            </Panel>

          </div>

        </div>
      </div>
    </DashboardShell>
  );
}
