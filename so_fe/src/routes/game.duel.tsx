import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Loader2, Check, X, Send, Terminal } from "lucide-react";
import { Panel } from "@/components/Panel";
import { TButton } from "@/components/TButton";
import { useAuth } from "@/lib/auth-store";
import { useDuel } from "@/lib/duel-store";
import { evaluateAnswer } from "@/lib/stackquest.algorithm";

export const Route = createFileRoute("/game/duel")({
  validateSearch: (s: Record<string, unknown>) => ({
    match_id: typeof s.match_id === "string" ? s.match_id : "",
  }),
  component: DuelScreen,
});

const ROUND_MS = 30_000;

function DuelScreen() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const { phase, player, opponent, questions, round, secondsRemaining, submitAnswer, history, reset, winnerId, eloDelta } = useDuel();

  const [submission, setSubmission] = useState("");
  const remaining = secondsRemaining * 1000;

  // when the match is complete, navigate to result screen
  useEffect(() => {
    if (phase === "complete" && player && opponent) {
      const won = winnerId === player.id ? 1 : 0;
      navigate({
        to: "/game/result",
        search: {
          won,
          p_score: player.score,
          o_score: opponent.score,
          opp: opponent.username,
          elo_delta: eloDelta,
          streak: player.streak,
        },
      });
    }
  }, [phase, player, opponent, winnerId, eloDelta, navigate]);

  // reset submission on new question
  useEffect(() => { setSubmission(""); }, [round]);

  if (!user) return <Navigate to="/auth" />;
  if (phase === "idle" || !player || !opponent) return <Navigate to="/dashboard/duels" />;

  const q = questions[round];
  const pct = Math.max(0, (remaining / ROUND_MS) * 100);
  const lowTime = remaining < 8000;

  const handleSubmit = () => {
    if (!submission.trim() || player.locked) return;
    submitAnswer(submission);
  };

  const pEval = phase === "reveal" ? evaluateAnswer(q, player.submission) : null;
  const oEval = phase === "reveal" ? evaluateAnswer(q, opponent.submission) : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* TOP SCOREBOARD */}
      <header className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-3 grid grid-cols-3 items-center gap-4">
          <ScoreBubble side="left" name={player.username} avatar={player.avatarUrl} score={player.score} streak={player.streak} tone="info" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
              round {round + 1} of {questions.length}
            </div>
            <div className={`mt-1 font-mono text-2xl font-black tabular-nums ${lowTime ? "text-danger animate-pulse" : ""}`}>
              {(remaining / 1000).toFixed(1)}s
            </div>
          </div>
          <ScoreBubble side="right" name={opponent.username} avatar={opponent.avatarUrl} score={opponent.score} streak={opponent.streak} tone="danger" />
        </div>
        {/* timing bar */}
        <div className="h-1 bg-background">
          <motion.div
            className={`h-full ${lowTime ? "bg-danger" : "bg-accent"}`}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.1, ease: "linear" }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-6 lg:py-10 max-w-[1100px] w-full mx-auto">
        <Panel title={`problem.${q.id}`} header={<TypeBadge type={q.type} />}>
          <div className="p-6 sm:p-8">
            <div className="text-base sm:text-lg leading-relaxed">{q.prompt}</div>
            {q.code && (
              <pre className="mt-5 p-4 bg-background border border-hairline rounded-sm text-[13px] leading-relaxed text-foreground overflow-x-auto">
                <code>{highlight(q.code)}</code>
              </pre>
            )}
          </div>

          <div className="border-t border-hairline bg-background/40 p-6">
            {q.type === "mcq" || q.type === "true_false" ? (
              <McqGrid
                options={q.options ?? []}
                locked={player.locked}
                selected={submission}
                onSelect={(v) => { setSubmission(v); submitAnswer(v); }}
                correctAnswer={phase === "reveal" ? q.answer : undefined}
                playerPick={phase === "reveal" ? player.submission : undefined}
              />
            ) : (
              <TextInput
                value={submission}
                onChange={setSubmission}
                onSubmit={handleSubmit}
                locked={player.locked}
                multiline={q.type === "scenario" || q.type === "code_output"}
                phase={phase}
                correct={pEval?.correct}
              />
            )}
          </div>
        </Panel>

        {/* lock overlay text */}
        <AnimatePresence>
          {phase === "playing" && player.locked && !opponent.locked && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center justify-center gap-2 text-xs font-mono text-accent uppercase tracking-widest"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              input locked. awaiting rival data...
            </motion.div>
          )}
        </AnimatePresence>

        {/* reveal banner */}
        <AnimatePresence>
          {phase === "reveal" && pEval && oEval && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <RevealCard label="you" correct={pEval.correct} reason={pEval.reason} submission={player.submission} />
              <RevealCard label="rival" correct={oEval.correct} reason={oEval.reason} submission={opponent.submission} />
              {q.explanation && (
                <div className="sm:col-span-2 text-xs text-muted-foreground font-mono p-3 border border-dashed border-border rounded-sm">
                  <span className="text-accent">// answer:</span> <span className="text-foreground">{q.answer}</span>
                  <div className="mt-1">// {q.explanation}</div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-hairline px-4 py-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <div>socket · /duel · {Math.floor(30 + Math.random() * 30)}ms</div>
        <button
          onClick={() => { reset(); navigate({ to: "/dashboard/duels" }); }}
          className="text-muted-foreground hover:text-danger"
        >
          forfeit_match()
        </button>
      </footer>
    </div>
  );
}

function highlight(code: string) {
  return code;
}

function TypeBadge({ type }: { type: string }) {
  const label = type.replace('_', ' ').toUpperCase();
  return (
    <span className="border border-accent text-accent px-2 py-0.5 text-[10px] uppercase tracking-widest">
      {label}
    </span>
  );
}

function ScoreBubble({
  side, name, avatar, score, streak, tone,
}: { side: "left" | "right"; name: string; avatar: string; score: number; streak: number; tone: "info" | "danger" }) {
  const color = tone === "info" ? "text-info border-info" : "text-danger border-danger";
  return (
    <div className={`flex items-center gap-3 ${side === "right" ? "flex-row-reverse text-right" : ""}`}>
      <img src={avatar} alt="" className={`h-10 w-10 rounded-sm border-2 ${color} bg-surface`} />
      <div className="min-w-0">
        <div className={`text-[10px] uppercase tracking-widest ${color.split(" ")[0]}`}>
          {tone === "info" ? "you" : "rival"}
        </div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-lg sm:text-xl font-black tabular-nums">{score}</div>
          {streak >= 2 && (
            <span className="flex items-center gap-0.5 text-warning text-xs font-bold">
              <Flame className="h-3.5 w-3.5" />{streak}x
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{name}</div>
      </div>
    </div>
  );
}

function McqGrid({
  options, locked, selected, onSelect, correctAnswer, playerPick,
}: {
  options: string[]; locked: boolean; selected: string;
  onSelect: (v: string) => void; correctAnswer?: string; playerPick?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        const isPick = (correctAnswer ? playerPick : selected) === o;
        const isCorrect = correctAnswer === o;
        const wrongPick = correctAnswer && isPick && !isCorrect;
        let cls = "border-border bg-background hover:border-foreground";
        if (isPick && !correctAnswer) cls = "border-accent neon-ring bg-surface";
        if (correctAnswer && isCorrect) cls = "border-success bg-success/10 text-success";
        if (wrongPick) cls = "border-danger bg-danger/10 text-danger";
        return (
          <motion.button
            key={o}
            disabled={locked}
            whileTap={{ scale: 0.98 }}
            onClick={() => !locked && onSelect(o)}
            className={`group text-left px-4 py-3 rounded-sm border tactile transition flex items-center gap-3 disabled:cursor-not-allowed ${cls}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest border border-current px-1.5 py-0.5">{letter}</span>
            <span className="font-mono text-sm flex-1">{o}</span>
            {correctAnswer && isCorrect && <Check className="h-4 w-4" />}
            {wrongPick && <X className="h-4 w-4" />}
          </motion.button>
        );
      })}
    </div>
  );
}

function TextInput({
  value, onChange, onSubmit, locked, multiline, phase, correct,
}: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  locked: boolean; multiline: boolean; phase: string; correct?: boolean;
}) {
  const showResult = phase === "reveal" && correct !== undefined;
  const borderTone = showResult ? (correct ? "border-success" : "border-danger") : "border-border focus-within:border-accent";
  return (
    <div>
      <div className={`relative bg-background border ${borderTone} rounded-sm transition`}>
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline text-[10px] uppercase tracking-widest text-muted-foreground">
          <Terminal className="h-3 w-3" /> shell · type answer · ↵ to submit
        </div>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            placeholder="// describe your answer..."
            rows={4}
            className="w-full bg-transparent px-4 py-3 font-mono text-sm resize-none focus:outline-none disabled:opacity-70"
          />
        ) : (
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-accent font-bold">›</span>
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
              disabled={locked}
              autoFocus
              placeholder="type answer..."
              className="flex-1 bg-transparent font-mono text-sm focus:outline-none disabled:opacity-70"
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground font-mono">
          {locked ? "// locked" : `${value.length} chars`}
        </div>
        <TButton variant="primary" onClick={onSubmit} disabled={locked || !value.trim()}>
          <Send className="h-3.5 w-3.5" /> submit code
        </TButton>
      </div>
    </div>
  );
}

function RevealCard({ label, correct, reason, submission }: { label: string; correct: boolean; reason: string; submission: string }) {
  return (
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      className={`p-4 rounded-sm border ${correct ? "border-success bg-success/10" : "border-danger bg-danger/10"}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest">{label}</div>
        <div className={`flex items-center gap-1 font-bold ${correct ? "text-success" : "text-danger"}`}>
          {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {correct ? "+points" : "no points"}
        </div>
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">{reason}</div>
      <div className="mt-2 font-mono text-sm break-words">
        <span className="text-muted-foreground">{"›"} </span>
        {submission || <span className="italic text-muted-foreground">// no submission</span>}
      </div>
    </motion.div>
  );
}
