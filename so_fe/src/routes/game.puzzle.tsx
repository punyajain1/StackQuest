import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, HelpCircle, Check, X, Send, Terminal, Loader2, Award, ArrowRight, Home } from "lucide-react";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/game/puzzle")({
  validateSearch: (s: Record<string, unknown>) => ({
    tag: typeof s.tag === "string" ? s.tag : "",
    difficulty: typeof s.difficulty === "string" ? s.difficulty : "medium",
  }),
  component: PuzzleGameplayPage,
});

interface SessionSnapshot {
  session_id: string;
  score: number;
  streak: number;
  streak_multiplier: number;
  questions_answered: number;
  correct_count: number;
  xp_earned: number;
}

interface QuestionDetails {
  question_type: "mcq" | "fill_in_blank" | "string_answer";
  question_text: string;
  options: string[];
  blank_text?: string;
  hint?: string;
  time_limit: number;
  question: {
    question_id: number;
    title: string;
    body: string;
    body_markdown: string;
    tags: string[];
    score: number;
    answer_count?: number;
    accepted_answer_id?: number | null;
    top_answer_body?: string | null;
    top_answer_score?: number | null;
    top_answer_author?: string | null;
    view_count?: number;
    difficulty?: string;
    is_answered?: boolean;
    creation_date?: number;
  };
}

interface EvaluationResult {
  correct: boolean;
  scoreEarned: number;
  xpEarned: number;
  feedback: string;
  correctAnswer: string;
}

function PuzzleGameplayPage() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const fetchUserProfile = useAuth((s) => s.fetchUserProfile);
  const navigate = useNavigate();

  const { tag, difficulty } = Route.useSearch();

  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [question, setQuestion] = useState<QuestionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Input / Submission State
  const [submission, setSubmission] = useState("");
  const [locked, setLocked] = useState(false);
  const [verdict, setVerdict] = useState<EvaluationResult | null>(null);
  const [sessionEndStats, setSessionEndStats] = useState<any | null>(null);

  // Time tracking
  const roundStartTime = useRef<number>(0);

  // 1. Initialize puzzle session on mount
  useEffect(() => {
    if (!token) return;
    const startSession = async () => {
      try {
        const res = await fetch("http://localhost:3000/api/game/puzzle/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tag, difficulty }),
        });
        const json = await res.json();
        if (json.success) {
          setSession(json.data);
          // fetch first question
          await fetchQuestion(json.data.session_id);
        } else {
          throw new Error(json.error?.message || "Failed to start session");
        }
      } catch (err) {
        console.error("Error starting puzzle session:", err);
        navigate({ to: "/dashboard/puzzles" });
      }
    };
    startSession();
  }, [tag, difficulty, token]);

  const fetchQuestion = async (sessId: string) => {
    setLoading(true);
    setSubmission("");
    setLocked(false);
    setVerdict(null);
    try {
      const res = await fetch(`http://localhost:3000/api/game/question?session_id=${sessId}&difficulty=${difficulty}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setQuestion(json.data);
        roundStartTime.current = Date.now();
      } else {
        throw new Error(json.error?.message || "No more questions");
      }
    } catch (err) {
      console.error("Error loading question:", err);
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (pick?: string) => {
    if (!session || !question || locked) return;

    const answer = pick || submission;
    if (!answer.trim()) return;

    setLocked(true);
    const timeTakenMs = Math.min(Date.now() - roundStartTime.current, 300000); // capped at 5 minutes

    try {
      const res = await fetch("http://localhost:3000/api/game/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: session.session_id,
          question_id: question.question.question_id,
          question_type: question.question_type,
          player_choice: question.question_type === "mcq" ? answer : undefined,
          player_answer: question.question_type !== "mcq" ? answer : undefined,
          time_taken_ms: timeTakenMs,
          question_snapshot: question.question,
        }),
      });

      const json = await res.json();
      if (json.success) {
        const { correct, scoreEarned, xpEarned, feedback, correctAnswer, snapshot } = json.data;
        setVerdict({ correct, scoreEarned, xpEarned, feedback, correctAnswer });
        setSession(snapshot);
      }
    } catch (err) {
      console.error("Failed to submit answer:", err);
      setLocked(false);
    }
  };

  const endPuzzleSession = async () => {
    if (!session || !token) return;
    try {
      const res = await fetch("http://localhost:3000/api/game/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: session.session_id }),
      });
      const json = await res.json();
      if (json.success) {
        setSessionEndStats(json.data);
        await fetchUserProfile(); // refresh user ELO/XP stats on main account
      }
    } catch (err) {
      console.error("Failed to end session:", err);
      navigate({ to: "/dashboard/puzzles" });
    }
  };

  if (!user) return <Navigate to="/auth" />;

  const getCleanCode = (c?: string) => {
    if (!c) return null;
    return c;
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      
      {/* HUD Header */}
      <header className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center bg-accent text-background rounded-sm font-black">
              {tag.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-accent">// active_practice</div>
              <div className="text-sm font-bold truncate max-w-[160px] lowercase">#{tag} · {difficulty}</div>
            </div>
          </div>

          <div className="flex items-center gap-6 sm:gap-10">
            <div className="text-center hidden sm:block">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">multiplier</div>
              <div className="text-sm font-black text-warning">{(session?.streak_multiplier ?? 1)}x</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">streak</div>
              <div className="text-sm font-black text-foreground">{(session?.streak ?? 0)}x 🔥</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">points</div>
              <div className="text-sm font-black text-accent tabular-nums">{(session?.score ?? 0)} PTS</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-6 lg:py-10 max-w-[1000px] w-full mx-auto flex flex-col justify-center">
        
        <AnimatePresence mode="wait">
          
          {/* 1. Loading State */}
          {loading && !sessionEndStats && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-32 text-center font-mono text-sm text-accent uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> downloading next challenge...
            </motion.div>
          )}

          {/* 2. End Stats Summary Overlay */}
          {!loading && sessionEndStats && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg mx-auto"
            >
              <Panel title="puzzle.session_complete">
                <div className="p-6 text-center font-mono">
                  <div className="inline-grid place-items-center h-20 w-20 rounded-full bg-accent/15 border-2 border-accent mb-4">
                    <Award className="h-10 w-10 text-accent animate-bounce" />
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-accent">// practice_complete</div>
                  <h2 className="text-3xl font-black tracking-tight mt-1">SESSION SUMMARY</h2>

                  <div className="grid grid-cols-2 gap-4 mt-6 border-y border-hairline py-4 text-left">
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">questions solved</div>
                      <div className="text-lg font-bold">{sessionEndStats.correctCount} / {sessionEndStats.questionsCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">total score</div>
                      <div className="text-lg font-bold text-accent">{sessionEndStats.score} pts</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">accuracy</div>
                      <div className="text-lg font-bold">{Math.round((sessionEndStats.accuracy ?? 0) * 100)}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase">xp rewarded</div>
                      <div className="text-lg font-bold text-success">+{sessionEndStats.xpEarned} XP</div>
                    </div>
                  </div>

                  <TButton
                    variant="primary"
                    className="w-full mt-6"
                    onClick={() => navigate({ to: "/dashboard/puzzles" })}
                  >
                    <Home className="h-4 w-4" /> return to console
                  </TButton>
                </div>
              </Panel>
            </motion.div>
          )}

          {/* 3. Gameplay Board */}
          {!loading && !sessionEndStats && question && (
            <motion.div
              key="gameboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <Panel
                title={`puzzle.${question.question.question_id}`}
                header={
                  <span className="border border-accent text-accent px-2 py-0.5 text-[9px] uppercase tracking-widest font-mono">
                    {question.question_type === "mcq" ? "MULTIPLE CHOICE" : question.question_type === "fill_in_blank" ? "FILL IN BLANK" : "FREE RESPONSE"}
                  </span>
                }
              >
                <div className="p-6 sm:p-8 font-mono">
                  
                  {/* Prompt */}
                  <div className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                    {question.question_text}
                  </div>

                  {/* Optional pre-formatted Code Blocks */}
                  {getCleanCode(question.question.top_answer_body || undefined) && question.question_type === "string_answer" && (
                    <pre className="mt-5 p-4 bg-background border border-hairline rounded-sm text-[13px] leading-relaxed text-foreground overflow-x-auto select-all">
                      <code>{stripHtml(question.question.top_answer_body || "")}</code>
                    </pre>
                  )}

                </div>

                {/* Input Panel */}
                <div className="border-t border-hairline bg-background/40 p-6">
                  {question.question_type === "mcq" ? (
                    
                    /* MCQ Choices Grid */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {question.options.map((o, i) => {
                        const letter = String.fromCharCode(65 + i);
                        const isSelected = submission === o;
                        const isCorrect = verdict?.correctAnswer === o;
                        const wrongPick = verdict && isSelected && !isCorrect;

                        let borderClass = "border-border bg-background hover:border-foreground";
                        if (isSelected && !verdict) borderClass = "border-accent neon-ring bg-surface";
                        if (verdict && isCorrect) borderClass = "border-success bg-success/10 text-success";
                        if (wrongPick) borderClass = "border-danger bg-danger/10 text-danger";

                        return (
                          <motion.button
                            key={o}
                            disabled={locked}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setSubmission(o); submitAnswer(o); }}
                            className={`group text-left px-4 py-3 rounded-sm border tactile transition flex items-center gap-3 disabled:cursor-not-allowed font-mono ${borderClass}`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-widest border border-current px-1.5 py-0.5">{letter}</span>
                            <span className="text-xs flex-1 truncate">{o}</span>
                            {verdict && isCorrect && <Check className="h-4 w-4 shrink-0" />}
                            {wrongPick && <X className="h-4 w-4 shrink-0" />}
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : (
                    
                    /* Custom Text Input Terminal Box */
                    <div className="font-mono">
                      <div className={`relative bg-background border ${
                        verdict ? (verdict.correct ? "border-success" : "border-danger") : "border-border focus-within:border-accent"
                      } rounded-sm transition`}>
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline text-[9px] uppercase tracking-widest text-muted-foreground">
                          <Terminal className="h-3.5 w-3.5" /> console · write code · press enter
                        </div>

                        {question.question_type === "string_answer" ? (
                          <textarea
                            value={submission}
                            onChange={(e) => setSubmission(e.target.value)}
                            disabled={locked}
                            placeholder="// formulate your conceptual response..."
                            rows={4}
                            className="w-full bg-transparent px-4 py-3 font-mono text-sm resize-none focus:outline-none disabled:opacity-75"
                          />
                        ) : (
                          <div className="flex items-center gap-2 px-4 py-3">
                            <span className="text-accent font-bold">›</span>
                            <input
                              value={submission}
                              onChange={(e) => setSubmission(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }}
                              disabled={locked}
                              placeholder="enter parameter..."
                              className="flex-1 bg-transparent font-mono text-sm focus:outline-none disabled:opacity-75"
                            />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-[10px] text-muted-foreground">
                          {locked ? "// lock verified" : `${submission.length} characters`}
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

              {/* Assessment Verdict Overlay */}
              <AnimatePresence>
                {verdict && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Verdict Card */}
                    <div className={`p-4 rounded-sm border font-mono ${
                      verdict.correct ? "border-success bg-success/15" : "border-danger bg-danger/15"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-widest">// assess_verdict</div>
                        <div className={`flex items-center gap-1 font-bold ${verdict.correct ? "text-success" : "text-danger"}`}>
                          {verdict.correct ? (
                            <><Check className="h-4 w-4" /> +{verdict.scoreEarned} PTS</>
                          ) : (
                            <><X className="h-4 w-4" /> WRONG</>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{verdict.feedback}</div>
                      
                      {/* Canned correct answer display */}
                      {!verdict.correct && (
                        <div className="mt-3 border-t border-hairline pt-3">
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">// reference_correct</div>
                          <pre className="mt-1 bg-background border border-border p-2 rounded-sm text-xs max-h-[140px] overflow-y-auto whitespace-pre-wrap select-all font-mono">
                            {verdict.correctAnswer}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Explanatory StackOverflow context */}
                    {question.hint && (
                      <div className="text-xs text-muted-foreground font-mono p-4 border border-dashed border-border rounded-sm">
                        <span className="text-accent">// stackoverflow_context:</span>
                        <div className="mt-1 leading-relaxed">{question.hint}</div>
                      </div>
                    )}

                    {/* Actions Panel */}
                    <div className="flex items-center gap-3">
                      <TButton
                        variant="outline"
                        className="flex-1"
                        onClick={endPuzzleSession}
                      >
                        abort_session()
                      </TButton>
                      <TButton
                        variant="primary"
                        className="flex-1"
                        onClick={() => {
                          if (session) {
                            fetchQuestion(session.session_id);
                          }
                        }}
                      >
                        next_puzzle <ArrowRight className="h-4 w-4" />
                      </TButton>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* Footer statistics */}
      {!sessionEndStats && (
        <footer className="border-t border-hairline px-4 py-3 flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground mt-10">
          <div>engine · standard REST/v1</div>
          <button
            onClick={endPuzzleSession}
            className="text-muted-foreground hover:text-danger hover:underline transition"
          >
            forfeit_session()
          </button>
        </footer>
      )}

    </div>
  );
}

// Utility to clean up HTML from text blocks
function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => `\n${code.trim()}\n`)
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_, code) => `\`${code}\``)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
