import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, ChevronLeft, Shuffle } from "lucide-react";
import { TButton } from "@/components/TButton";
import { Panel } from "@/components/Panel";
import { useAuth } from "@/lib/auth-store";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

const AVATAR_STYLES = [
  "pixel-art", "bottts", "adventurer", "identicon",
  "shapes", "rings", "icons", "thumbs",
];

const STACKS = [
  { id: "javascript", label: "javascript", glyph: "⚡", tint: "#f7df1e" },
  { id: "typescript", label: "typescript", glyph: "▲", tint: "#3178c6" },
  { id: "python", label: "python", glyph: "🐍", tint: "#3776ab" },
  { id: "react", label: "react", glyph: "⚛", tint: "#61dafb" },
  { id: "node", label: "node.js", glyph: "▶", tint: "#3c873a" },
  { id: "rust", label: "rust", glyph: "⚙", tint: "#dea584" },
  { id: "go", label: "golang", glyph: "◆", tint: "#00add8" },
  { id: "sql", label: "sql", glyph: "◰", tint: "#e38c00" },
  { id: "docker", label: "docker", glyph: "🐳", tint: "#2496ed" },
  { id: "linux", label: "linux", glyph: "🐧", tint: "#fcc624" },
  { id: "css", label: "css", glyph: "{ }", tint: "#264de4" },
  { id: "k8s", label: "kubernetes", glyph: "☸", tint: "#326ce5" },
];

function OnboardingPage() {
  const user = useAuth((s) => s.user);
  const patchUser = useAuth((s) => s.patchUser);
  const syncProfileWithBackend = useAuth((s) => s.syncProfileWithBackend);
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(user?.username ?? "");
  const [avatarStyle, setAvatarStyle] = useState(user?.avatarStyle ?? "pixel-art");
  const [stacks, setStacks] = useState<string[]>(user?.stacks ?? []);
  const [saving, setSaving] = useState(false);

  if (!user) return <Navigate to="/auth" />;

  const available = username.length >= 3 && username.length <= 20 && /^[A-Za-z0-9_]+$/.test(username);
  const avatarUrl = useMemo(
    () => `https://api.dicebear.com/7.x/${avatarStyle}/svg?seed=${encodeURIComponent(username || "guest")}`,
    [avatarStyle, username],
  );

  const finish = async () => {
    setSaving(true);
    try {
      const bio = `Slinging ${stacks.slice(0, 3).join(" / ") || "code"} at 60fps.`;
      await syncProfileWithBackend({ username, avatarUrl, bio });
      patchUser({ avatarStyle, stacks, onboarded: true });
      toast.success("Profile deployed successfully!");
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to finalize profile. Codename might be taken.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStep((s) => Math.min(2, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          <div>~/init_profile.sh</div>
          <div>step {step + 1} of 3</div>
        </div>

        <Panel title="onboarding.terminal">
          {/* progress bar */}
          <div className="h-0.5 bg-background relative">
            <motion.div
              className="absolute inset-y-0 left-0 bg-accent"
              animate={{ width: `${((step + 1) / 3) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 30 }}
            />
          </div>

          <div className="p-8 min-h-[420px]">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                >
                  <Heading num="01" title="codename" sub="how should the leaderboard render you?" />
                  <div className="mt-6 flex items-center gap-3">
                    <span className="text-accent font-bold">{"›"}</span>
                    <input
                      autoFocus
                      value={username}
                      onChange={(e) => setUsername(e.target.value.slice(0, 20).replace(/\s/g, "_"))}
                      placeholder="codeMonkey"
                      className="flex-1 bg-background border border-border rounded-sm px-3 py-3 text-lg font-mono focus:outline-none focus:border-accent"
                    />
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {username.length}/20
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] font-mono">
                    {available ? (
                      <span className="text-success flex items-center gap-1">
                        <Check className="h-3 w-3" /> available · unique handle
                      </span>
                    ) : (
                      <span className="text-warning">
                        // 3–20 chars · letters, numbers, underscore
                      </span>
                    )}
                  </div>

                  <div className="mt-8 grid grid-cols-[auto_1fr] gap-5 items-center border border-hairline rounded-sm bg-background p-5">
                    <img src={avatarUrl} alt="" className="h-16 w-16 rounded-sm border border-border bg-surface" />
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        starting_rating
                      </div>
                      <div className="text-3xl font-black font-mono">
                        1000 <span className="text-accent text-sm align-middle">ELO</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        bronze league · 0 duels played
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                >
                  <Heading num="02" title="avatar matrix" sub="pick a render style for your portrait" />

                  <div className="mt-6 flex items-start gap-6">
                    <div className="relative">
                      <div className="absolute -inset-1 bg-accent/30 blur-xl" />
                      <img
                        src={avatarUrl}
                        alt=""
                        className="relative h-32 w-32 rounded-sm border-2 border-accent bg-surface"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                        select_style
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {AVATAR_STYLES.map((s) => (
                          <button
                            key={s}
                            onClick={() => setAvatarStyle(s)}
                            className={`group relative aspect-square border rounded-sm overflow-hidden transition ${
                              avatarStyle === s
                                ? "border-accent bg-surface neon-ring"
                                : "border-border bg-background hover:border-foreground"
                            }`}
                          >
                            <img
                              src={`https://api.dicebear.com/7.x/${s}/svg?seed=${username || "stack"}`}
                              alt={s}
                              className="h-full w-full"
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur-sm text-[8px] uppercase tracking-widest py-0.5 text-center truncate">
                              {s}
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          setUsername(
                            (username || "Guest") + Math.floor(Math.random() * 99),
                          )
                        }
                        className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-accent flex items-center gap-1.5"
                      >
                        <Shuffle className="h-3 w-3" /> reseed
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                >
                  <Heading num="03" title="stack preferences" sub="tag the languages you ship — calibrates matchmaking" />

                  <div className="mt-6 grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {STACKS.map((s) => {
                      const active = stacks.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() =>
                            setStacks((prev) =>
                              prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                            )
                          }
                          style={active ? { borderColor: s.tint, boxShadow: `0 0 0 1px ${s.tint}, 4px 4px 0 0 #09090b` } : undefined}
                          className={`relative px-3 py-3 rounded-sm border bg-background tactile text-left transition ${
                            active ? "" : "border-border hover:border-foreground"
                          }`}
                        >
                          <div className="text-base leading-none" style={{ color: active ? s.tint : undefined }}>
                            {s.glyph}
                          </div>
                          <div className="mt-1.5 text-[11px] font-mono">{s.label}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-[11px] text-muted-foreground font-mono">
                    {stacks.length} selected · {stacks.length >= 1 ? "ready" : "pick at least 1"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-hairline bg-background/50 p-4 flex items-center justify-between">
            <TButton variant="ghost" size="sm" onClick={prev} disabled={step === 0}>
              <ChevronLeft className="h-4 w-4" /> back
            </TButton>

            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 w-6 ${i <= step ? "bg-accent" : "bg-border"}`}
                />
              ))}
            </div>

            {step < 2 ? (
              <TButton
                onClick={next}
                disabled={(step === 0 && !available) || (step === 1 && !avatarStyle)}
                variant="outline"
              >
                next <ChevronRight className="h-4 w-4" />
              </TButton>
            ) : (
              <TButton onClick={finish} variant="primary" disabled={stacks.length === 0 || saving}>
                deploy_profile() <ChevronRight className="h-4 w-4" />
              </TButton>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Heading({ num, title, sub }: { num: string; title: string; sub: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.3em] text-accent">{`// step_${num}`}</div>
      <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}
