import type { Question } from "./stackquest.algorithm";

export const QUESTION_BANK: Question[] = [
  {
    id: "q1",
    type: "mcq",
    prompt: "What does the following JavaScript snippet log?",
    language: "javascript",
    code: `const a = [1, 2, 3];\nconst b = a;\nb.push(4);\nconsole.log(a.length);`,
    options: ["3", "4", "undefined", "TypeError"],
    answer: "4",
    explanation: "Arrays are reference types — b and a point to the same array.",
  },
  {
    id: "q2",
    type: "fill_in_blank",
    prompt: "Complete the React hook that runs once on mount:",
    language: "tsx",
    code: `useEffect(() => {\n  console.log("mounted");\n}, ___);`,
    answer: "[]",
    explanation: "An empty dependency array runs the effect only on mount.",
  },
  {
    id: "q3",
    type: "mcq",
    prompt: "Which HTTP status indicates a successful resource creation?",
    options: ["200 OK", "201 Created", "204 No Content", "301 Moved"],
    answer: "201 Created",
  },
  {
    id: "q4",
    type: "fill_in_blank",
    prompt: "Fill in the missing Python keyword to define a class method bound to the class itself.",
    language: "python",
    code: `class Foo:\n    @___\n    def bar(cls):\n        return cls`,
    answer: "classmethod",
  },
  {
    id: "q5",
    type: "string_answer",
    prompt: "In one sentence, explain why mutating React state directly is problematic.",
    answer:
      "React relies on referential equality to detect changes; mutating state directly bypasses the setter so components do not re-render and the virtual dom diff is skipped.",
    referenceKeywords: ["react", "state", "mutate", "rerender", "reference", "setter", "diff"],
  },
  {
    id: "q6",
    type: "mcq",
    prompt: "What is the time complexity of inserting into a balanced binary search tree?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
    answer: "O(log n)",
  },
  {
    id: "q7",
    type: "fill_in_blank",
    prompt: "Complete the CSS to center a flex child both axes:",
    language: "css",
    code: `.parent {\n  display: flex;\n  justify-content: center;\n  align-items: ___;\n}`,
    answer: "center",
  },
  {
    id: "q8",
    type: "string_answer",
    prompt: "Briefly: what does the SQL keyword JOIN do?",
    answer:
      "Join combines rows from two or more tables based on a related column producing a single result set using keys to match records.",
    referenceKeywords: ["join", "combine", "rows", "tables", "column", "key", "match"],
  },
];

export function pickRoundQuestions(n = 5): Question[] {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
