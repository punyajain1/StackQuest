import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { Zap, Calendar, Check, X, Send, Terminal, Loader2, Award, Home, Lock } from "lucide-react";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/game/daily")({
  head: () => ({
    meta: [
      { title: "Daily Challenge Arena — StackQuest" },
      { name: "description", content: "Compete in the daily 10-question Stack Overflow challenge. Resets every 24 hours." },
    ],
  }),
  component: DailyChallengePage,
});

interface DailyQuestion {
  question_number: number;
  total: number;
  question_type: "mcq" | "true_false" | "fill_blank" | "scenario" | "code_output";
  question_text: string;
  options?: string[];
  time_limit: number;
  knowledge_card_id: string;
  topic: string;
  concept: string;
  difficulty: string;
}

interface QuestionVerdict {
  correct: boolean;
  score_earned: number;
  xp_earned: number;
  feedback: string;
  correct_answer: string;
}

interface FinalSummary {
  total_score: number;
  correct_count: number;
  xp_earned: number;
  accuracy: number;
  duration_secs: number;
}

const WS_DAILY = "http://localhost:3000/daily";

function DailyChallengePage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const fetchUserProfile = useAuth((s) => s.fetchUserProfile);
  const navigate = useNavigate();

  // Guards
  const [checkingGuard, setCheckingGuard] = useState(true);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState("");

  // Gameplay State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [submission, setSubmission] = useState("");
  const [locked, setLocked] = useState(false);
  const [verdict, setVerdict] = useState<QuestionVerdict | null>(null);
  const [finalSummary, setFinalSummary] = useState<FinalSummary | null>(null);
  
  // Scoring
  const [currentScore, setCurrentScore] = useState(0);

  const roundStartTime = useRef<number>(0);

  // Time remaining calculator for midnight UTC reset
  useEffect(() => {
    const updateTimeLeft = () => {
      const nextUtc = new Date();
      nextUtc.setUTCHours(24, 0, 0, 0);
      const diff = nextUtc.getTime() - Date.now();
      const hrs = Math.floor(diff / (1000 * 60 * 60)).toString().padStart(2, "0");
      const mins = Math.floor((diff / (1000 * 60)) % 60).toString().padStart(2, "0");
      const secs = Math.floor((diff / 1000) % 60).toString().padStart(2, "0");
      setTimeLeftStr(`${hrs}h ${mins}m ${secs}s`);
    };

    updateTimeLeft();
    const id = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(id);
  }, []);

  // 1. Session initialization check on mount
  useEffect(() => {
    if (!token) return;
    let activeSocket: any = null;

    const checkAttempt = async () => {
      try {
        const res = await fetch("http://localhost:3000/api/game/daily/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        
        if (data.success && !data.data.already_played) {
          // Allowed to play today, initialize WebSocket connection
          activeSocket = initializeSocket();
        } else {
          // Already played today or error
          setAlreadyPlayed(true);
          setCheckingGuard(false);
        }
      } catch (err) {
        console.error("Daily challenge start failed:", err);
        setAlreadyPlayed(true);
        setCheckingGuard(false);
      }
    };

    checkAttempt();
    return () => {
      if (activeSocket) {
        activeSocket.disconnect();
      } else if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);

  const initializeSocket = () => {
    const sk = io(WS_DAILY, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    sk.on("connect", () => {
      console.log("📅 Connected to Daily Challenge socket");
      sk.emit("daily:join");
      setCheckingGuard(false);
    });

    sk.on("daily:question", (data: DailyQuestion) => {
      console.log("📅 Daily question loaded:", data);
      setQuestion(data);
      setSecondsRemaining(data.time_limit);
      setSubmission("");
      setLocked(false);
      setVerdict(null);
      roundStartTime.current = Date.now();
    });

    sk.on("daily:timer", (data: { question_number: number; seconds_remaining: number }) => {
      setSecondsRemaining(data.seconds_remaining);
    });

    sk.on("daily:result", (data: QuestionVerdict) => {
      console.log("📅 Question result:", data);
      setVerdict(data);
      setLocked(true);
      setCurrentScore((s) => s + data.score_earned);
    });

    sk.on("daily:complete", (data: FinalSummary) => {
      console.log("📅 Daily challenge complete:", data);
      setFinalSummary(data);
      fetchUserProfile(); // sync XP
    });

    sk.on("daily:error", (data: { message: string }) => {
      console.error("📅 Daily challenge error:", data.message);
    });

    setSocket(sk);
    return sk;
  };

  const submitAnswer = (pick?: string) => {
    if (!socket || !question || locked) return;

    const answer = pick || submission;
    if (!answer.trim()) return;

    setLocked(true);
    const elapsedMs = Date.now() - roundStartTime.current;

    socket.emit("daily:submit", {
      question_number: question.question_number,
      answer,
      time_ms: elapsedMs,
    });
  };

  if (!user) return <Navigate to="/auth" />;

  const pct = Math.max(0, (secondsRemaining / (question?.time_limit ?? 30)) * 100);
  const lowTime = secondsRemaining < 8;

  return (
    <div className="min-h-screen flex flex-col relative">
      
      {/* 1. CHECKING SPLASH */}
      {checkingGuard && (
        <div className="flex-1 grid place-items-center bg-background font-mono">
          <div className="text-center text-accent uppercase tracking-widest text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> validating daily credential...
          </div>
        </div>
      )}

      {/* 2. ALREADY PLAYED LOCK OUT PAGE */}
      {!checkingGuard && alreadyPlayed && (
        <div className="flex-1 grid place-items-center bg-background p-6 font-mono">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <Panel title="daily.access_locked">
              <div className="p-6 text-center">
                <div className="inline-grid place-items-center h-20 w-20 rounded-full bg-warning/15 border-2 border-warning mb-4">
                  <Lock className="h-9 w-9 text-warning" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-warning">// authorization_denied</div>
                <h2 className="text-2xl font-bold tracking-tight mt-1">ALREADY PLAYED</h2>
                
                <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                  You have already solved today's fixed Daily Challenge set. 
                  In order to maintain competitive ranking integrity, only one attempt is authorized per developer per day.
                </p>

                <div className="mt-6 border border-border p-4 rounded-sm bg-background/50">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-widest">refreshes in</div>
                  <div className="text-2xl font-black text-foreground mt-1 tabular-nums animate-pulse">{timeLeftStr}</div>
                </div>

                <TButton
                  variant="outline"
                  className="w-full mt-6"
                  onClick={() => navigate({ to: "/dashboard" })}
                >
                  ← return to console
                </TButton>
              </div>
            </Panel>
          </motion.div>
        </div>
      )}

      {/* 3. GAMEPLAY BOARD */}
      {!checkingGuard && !alreadyPlayed && (
        <>
          {/* Header Scoreboard */}
          <header className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-30 font-mono">
            <div className="max-w-[1400px] mx-auto px-4 py-3 grid grid-cols-3 items-center gap-4">
              <div className="flex items-center gap-3">
                <img src={user.avatarUrl} alt="" className="h-9 w-9 border-2 border-warning bg-surface rounded-sm" />
                <div className="hidden sm:block">
                  <div className="text-[9px] uppercase tracking-widest text-warning">// developer</div>
                  <div className="text-xs font-bold truncate max-w-[140px]">{user.username}</div>
                </div>
              </div>

              <div className="text-center">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  {question ? `round ${question.question_number} of ${question.total}` : "INITIALIZING"}
                </div>
                <div className={`mt-0.5 text-xl font-black tabular-nums ${lowTime ? "text-danger animate-pulse" : "text-foreground"}`}>
                  {secondsRemaining.toFixed(0)}s
                </div>
              </div>

              <div className="text-right">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">score</div>
                <div className="text-lg font-black text-accent tabular-nums">{currentScore} PTS</div>
              </div>
            </div>

            {/* Timer bar progress */}
            <div className="h-1 bg-background">
              <motion.div
                className={`h-full ${lowTime ? "bg-danger" : "bg-accent"}`}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
          </header>

          {/* Gameplay Main Area */}
          <main className="flex-1 px-4 py-6 lg:py-10 max-w-[1000px] w-full mx-auto flex flex-col justify-center font-mono">
            <AnimatePresence mode="wait">
              
              {/* Final completion summary card */}
              {finalSummary && (
                <motion.div
                  key="daily-summary"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full max-w-md mx-auto"
                >
                  <Panel title="daily.challenge_complete">
                    <div className="p-6 text-center">
                      <div className="inline-grid place-items-center h-20 w-20 rounded-full bg-accent/15 border-2 border-accent mb-4">
                        <Award className="h-10 w-10 text-accent animate-bounce" />
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-accent">// daily_assessments</div>
                      <h2 className="text-3xl font-black mt-1">DAILY RESOLVED</h2>

                      <div className="grid grid-cols-2 gap-4 mt-6 border-y border-hairline py-4 text-left">
                        <div>
                          <div className="text-[9px] text-muted-foreground uppercase">correct answers</div>
                          <div className="text-base font-bold">{finalSummary.correct_count} / 10</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-muted-foreground uppercase">total score</div>
                          <div className="text-base font-bold text-accent">{finalSummary.total_score} pts</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-muted-foreground uppercase">accuracy</div>
                          <div className="text-base font-bold">{Math.round((finalSummary.accuracy ?? 0) * 100)}%</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-muted-foreground uppercase">xp rewards</div>
                          <div className="text-base font-bold text-success">+{finalSummary.xp_earned} XP</div>
                        </div>
                      </div>

                      <TButton
                        variant="primary"
                        className="w-full mt-6"
                        onClick={() => navigate({ to: "/dashboard" })}
                      >
                        <Home className="h-4 w-4" /> return to console
                      </TButton>
                    </div>
                  </Panel>
                </motion.div>
              )}

              {/* Active question layout */}
              {!finalSummary && question && (
                <motion.div
                  key={question.question_number}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <Panel
                    title={`daily.${question.question_number}`}
                    header={
                      <span className="border border-accent text-accent px-2 py-0.5 text-[9px] uppercase tracking-widest">
                        {question.question_type.replace('_', ' ').toUpperCase()}
                      </span>
                    }
                  >
                    <div className="p-6 sm:p-8">
                      <div className="text-sm sm:text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {question.question_text}
                      </div>
                    </div>

                    {/* Inputs */}
                    <div className="border-t border-hairline bg-background/40 p-6">
                      {question.question_type === "mcq" || question.question_type === "true_false" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {question.options?.map((o, i) => {
                            const letter = String.fromCharCode(65 + i);
                            const isPick = (verdict ? submission : submission) === o;
                            const isCorrect = verdict?.correct_answer === o;
                            const wrongPick = verdict && isPick && !isCorrect;

                            let borderClass = "border-border bg-background hover:border-foreground";
                            if (isPick && !verdict) borderClass = "border-accent neon-ring bg-surface";
                            if (verdict && isCorrect) borderClass = "border-success bg-success/10 text-success";
                            if (wrongPick) borderClass = "border-danger bg-danger/10 text-danger";

                            return (
                              <button
                                key={o}
                                disabled={locked}
                                onClick={() => { setSubmission(o); submitAnswer(o); }}
                                className={`text-left px-4 py-3 rounded-sm border tactile transition flex items-center gap-3 disabled:cursor-not-allowed ${borderClass}`}
                              >
                                <span className="font-mono text-[10px] uppercase tracking-widest border border-current px-1.5 py-0.5 shrink-0">{letter}</span>
                                <span className="text-xs flex-1 truncate">{o}</span>
                                {verdict && isCorrect && <Check className="h-4 w-4 shrink-0" />}
                                {wrongPick && <X className="h-4 w-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div>
                          <div className={`relative bg-background border ${
                            verdict ? (verdict.correct ? "border-success" : "border-danger") : "border-border focus-within:border-accent"
                          } rounded-sm transition`}>
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline text-[9px] uppercase tracking-widest text-muted-foreground">
                              <Terminal className="h-3.5 w-3.5" /> console · write code
                            </div>
                            
                            {question.question_type === "scenario" || question.question_type === "code_output" ? (
                              <textarea
                                value={submission}
                                onChange={(e) => setSubmission(e.target.value)}
                                disabled={locked}
                                placeholder="// describe your conceptual answer..."
                                rows={4}
                                className="w-full bg-transparent px-4 py-3 font-mono text-sm resize-none focus:outline-none disabled:opacity-70"
                              />
                            ) : (
                              <div className="flex items-center gap-2 px-4 py-3">
                                <span className="text-accent font-bold">›</span>
                                <input
                                  value={submission}
                                  onChange={(e) => setSubmission(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }}
                                  disabled={locked}
                                  placeholder="type answer..."
                                  className="flex-1 bg-transparent font-mono text-sm focus:outline-none disabled:opacity-70"
                                />
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <div className="text-[10px] text-muted-foreground">
                              {locked ? "// locked" : `${submission.length} chars`}
                            </div>
                            <TButton
                              variant="primary"
                              onClick={() => submitAnswer()}
                              disabled={locked || !submission.trim()}
                            >
                              <Send className="h-3.5 w-3.5" /> submit_answer()
                            </TButton>
                          </div>
                        </div>
                      )}
                    </div>
                  </Panel>

                  {/* Verdict assessment card */}
                  <AnimatePresence>
                    {verdict && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className={`p-4 rounded-sm border ${
                          verdict.correct ? "border-success bg-success/10" : "border-danger bg-danger/10"
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] uppercase tracking-widest">// assess_verdict</div>
                            <div className={`flex items-center gap-1 font-bold ${verdict.correct ? "text-success" : "text-danger"}`}>
                              {verdict.correct ? (
                                <><Check className="h-4 w-4" /> +{verdict.score_earned} PTS</>
                              ) : (
                                <><X className="h-4 w-4" /> WRONG</>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{verdict.feedback}</div>

                          {!verdict.correct && (
                            <div className="mt-3 border-t border-hairline pt-3">
                              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">// reference_correct</div>
                              <pre className="mt-1 bg-background border border-border p-2 rounded-sm text-xs max-h-[140px] overflow-y-auto whitespace-pre-wrap select-all font-mono">
                                {verdict.correct_answer}
                              </pre>
                            </div>
                          )}
                        </div>

                        {/* (stackoverflow context hint removed from backend) */}
                      </motion.div>
                    )}
                  </AnimatePresence>

                </motion.div>
              )}

            </AnimatePresence>
          </main>

          {/* Footer stats */}
          {!finalSummary && (
            <footer className="border-t border-hairline px-4 py-3 flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              <div>engine · Socket.io /daily namespace</div>
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="text-muted-foreground hover:text-danger hover:underline"
              >
                forfeit_challenge()
              </button>
            </footer>
          )}
        </>
      )}

    </div>
  );
}
