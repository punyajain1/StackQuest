"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/stores/game.store";
import { useAuthStore } from "@/stores/auth.store";
import { GameApi } from "@/api/game.api";
import { GameQuestion, EvaluateResponse } from "@/types/api.types";
import ReactMarkdown from "react-markdown";

export default function GamePlay() {
  const router = useRouter();
  const { sessionId, activeMode, currentSnapshot, updateSnapshot, endSession } = useGameStore();
  const { user } = useAuthStore();

  const [questionData, setQuestionData] = useState<GameQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [playerAnswer, setPlayerAnswer] = useState("");
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!sessionId) {
      router.replace("/game/setup");
      return;
    }
    fetchNextQuestion();
  }, [sessionId]);

  useEffect(() => {
    if (loading || result || !questionData) return;
    
    setTimeLeft(questionData.timeLimit);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [questionData, loading, result]);

  const fetchNextQuestion = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setPlayerAnswer("");
    try {
      const res = await GameApi.getQuestion(sessionId!);
      if (res.success) {
        setQuestionData(res.data);
        startTimeRef.current = Date.now();
      } else {
        setError(res.error?.message || "Failed to get question");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeUp = () => {
     // automatically submit something wrong or handle timeout
     if (!result) {
       submitAnswer(activeMode === "answer_arena" ? { player_answer: "timeout" } : { player_choice: "timeout" });
     }
  };

  const submitAnswer = async (payload: { player_choice?: string; player_answer?: string }) => {
    if (submitting || result || !questionData || !sessionId) return;
    
    setSubmitting(true);
    const timeTakenMs = Date.now() - startTimeRef.current;
    
    try {
      const res = await GameApi.evaluate(sessionId, questionData.question.question_id, {
         ...payload,
         time_taken_ms: timeTakenMs,
         question_snapshot: questionData.question
      });

      if (res.success) {
        setResult(res.data);
        updateSnapshot(res.data.snapshot);
      } else {
        setError(res.error?.message || "Failed to evaluate answer");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuit = async () => {
    if (sessionId) {
      await GameApi.endSession(sessionId);
      endSession();
    }
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--so-bg)] min-h-screen">
        <div className="text-[#6a737c]">Loading next question...</div>
      </div>
    );
  }

  if (error && !questionData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[var(--so-bg)] min-h-screen">
        <div className="text-red-600 mb-4">{error}</div>
        <button onClick={handleQuit} className="btn-so btn-so-primary">Quit</button>
      </div>
    );
  }

  if (!questionData) return null;

  return (
    <div className="flex-1 flex flex-col bg-[var(--so-bg)] min-h-screen pb-12">
      {/* Top HUD */}
      <div className="sticky top-0 z-10 bg-white border-b border-[var(--so-border)] shadow-sm p-4 flex justify-between items-center text-[13px]">
        <div className="flex items-center gap-4">
           <div><span className="text-[var(--so-text-muted)]">Mode:</span> <span className="font-semibold text-black uppercase">{activeMode?.replace('_', ' ')}</span></div>
           <div><span className="text-[var(--so-text-muted)]">Streak:</span> <span className="font-bold text-[var(--so-orange)]">{currentSnapshot?.streak}</span></div>
           <div><span className="text-[var(--so-text-muted)]">Score:</span> <span className="font-bold text-[var(--so-blue)]">{currentSnapshot?.score}</span></div>
        </div>
        <div className="flex items-center gap-4">
           <div className={`font-bold text-lg ${timeLeft < 10 ? 'text-red-500' : 'text-black'}`}>0:{timeLeft.toString().padStart(2, '0')}</div>
           <button onClick={handleQuit} className="btn-so btn-so-outline text-red-500 hover:bg-red-50">Quit Game</button>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto mt-6 px-4">
        {/* The Question */}
        <div className="so-card mb-6">
          <h1 className="text-[22px] font-normal text-[var(--so-blue)] mb-4" dangerouslySetInnerHTML={{ __html: questionData.question.title }}></h1>
          <div className="prose prose-sm max-w-none text-[#232629] border-b border-[var(--so-border)] pb-4 mb-4 overflow-hidden">
             <div 
               className="so-question-body overflow-x-auto break-words"
               dangerouslySetInnerHTML={{ __html: questionData.question.body || questionData.question.body_markdown }} 
             />
          </div>
          <div className="flex gap-2 mb-2 flex-wrap">
            {questionData.question.tags.map(t => (
              <span key={t} className="bg-[#e1ecf4] text-[#39739d] px-1.5 py-0.5 text-[12px] rounded">{t}</span>
            ))}
          </div>
        </div>

        {/* Input Area entirely depends on the mode */}
        <div className="so-card mb-6 bg-[#f8f9f9] border border-[var(--so-border)]">
          {!result && (
            <h2 className="font-bold text-[15px] mb-4">Your Answer:</h2>
          )}

          {!result && activeMode === "judge" && (
            <div className="flex gap-4">
               <button onClick={() => submitAnswer({ player_choice: "upvote" })} disabled={submitting} className="btn-so btn-so-outline flex-1 py-4 text-green-700 font-bold text-lg bg-white">👍 Upvoted (&gt;0)</button>
               <button onClick={() => submitAnswer({ player_choice: "downvote" })} disabled={submitting} className="btn-so btn-so-outline flex-1 py-4 text-red-700 font-bold text-lg bg-white">👎 Downvoted (&lt;0)</button>
            </div>
          )}

          {!result && activeMode === "score_guesser" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {["0-10", "10-100", "100-500", "500+"].map(range => (
                <button key={range} onClick={() => submitAnswer({ player_choice: range })} disabled={submitting} className="btn-so btn-so-outline bg-white py-3 font-semibold">{range}</button>
              ))}
            </div>
          )}

          {!result && activeMode === "multiple_choice" && (
            <div className="grid grid-cols-2 gap-4">
              {questionData.options?.map(opt => (
                <button key={opt} onClick={() => submitAnswer({ player_choice: opt })} disabled={submitting} className="btn-so btn-so-outline bg-white py-3 text-[var(--so-blue)] font-mono">{opt}</button>
              ))}
            </div>
          )}

          {!result && activeMode === "tag_guesser" && (
            <div className="flex gap-2">
               <input type="text" value={playerAnswer} onChange={e => setPlayerAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitAnswer({ player_choice: playerAnswer })} disabled={submitting} className="flex-1 bg-white border border-[var(--so-border)] rounded py-2 px-3 text-[14px]" placeholder="Type a single tag name..." />
               <button onClick={() => submitAnswer({ player_choice: playerAnswer })} disabled={submitting || !playerAnswer} className="btn-so btn-so-primary px-6">Submit</button>
            </div>
          )}

          {!result && activeMode === "answer_arena" && (
            <div className="flex flex-col gap-2">
               <textarea value={playerAnswer} onChange={e => setPlayerAnswer(e.target.value)} disabled={submitting} className="w-full bg-white border border-[var(--so-border)] rounded py-2 px-3 text-[14px] min-h-[150px]" placeholder="Write your best answer... (Markdown allowed)"></textarea>
               <button onClick={() => submitAnswer({ player_answer: playerAnswer })} disabled={submitting || playerAnswer.length < 10} className="btn-so btn-so-primary self-end px-8 py-2">Submit Answer</button>
            </div>
          )}

          {/* Results View */}
          {result && (
            <div className="flex flex-col items-center text-center">
               <div className={`text-4xl mb-2 ${result.correct ? 'text-green-500' : 'text-red-500'}`}>
                 {result.correct ? '✅ CORRECT' : '❌ INCORRECT'}
               </div>
               <div className="text-[15px] font-bold text-[#6a737c]">
                 +{result.scoreEarned} Points | +{result.xpEarned} XP
               </div>
               
               {result.evaluationResult && (
                 <div className="mt-4 p-4 bg-white border border-gray-200 rounded w-full text-left">
                    <h3 className="font-bold flex justify-between">
                      <span>AI Feedback: {result.evaluationResult.label.toUpperCase()}</span>
                      <span className="text-gray-500">{Math.round(result.evaluationResult.similarity * 100)}% Match</span>
                    </h3>
                    <p className="mt-2 text-gray-700">{result.evaluationResult.feedback}</p>
                 </div>
               )}

               <div className="mt-4 p-4 border border-[var(--so-border)] rounded w-full bg-white text-left text-[14px]">
                 <div className="text-[12px] text-gray-500 uppercase font-bold mb-1">True Answer / Score was:</div>
                 <div>SO Score: <span className="font-bold">{questionData.question.score}</span></div>
               </div>

               <button onClick={fetchNextQuestion} className="btn-so btn-so-primary mt-6 px-12 py-3 text-[15px]">
                 Next Question
               </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}