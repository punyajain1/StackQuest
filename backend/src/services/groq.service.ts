import Groq from 'groq-sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';

class GroqService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: env.GROQ_API_KEY,
    });
  }

  async generateKnowledgeCardsBulk(tag: string, items: { id: string, title: string, questionBody: string, answerBody: string }[]) {
    const inputContent = items.map(item => `
--- ITEM ID: ${item.id} ---
Question: ${item.title}
${item.questionBody}
Accepted Answer:
${item.answerBody}`).join("\n\n");

    const prompt = `You are a technical quiz generator.

Using the StackOverflow questions and accepted answers provided below:

Topic tag: ${tag}

${inputContent}

Generate for EACH item exactly:
- 1 MCQ
- 1 True/False

Return ONLY valid JSON matching this exact structure:
{
  "cards": [
    {
      "source_id": "<ITEM ID>",
      "concept": "<short concept name>",
      "difficulty": "easy" | "medium" | "hard",
      "summary": "<2-3 sentence summary>",
      "questions": {
        "mcqs": [
          {
            "id": "mcq_1",
            "type": "mcq",
            "question": "...",
            "options": ["...", "...", "...", "..."],
            "correctAnswer": 0,
            "explanation": "..."
          }
        ],
        "trueFalse": [
          {
            "id": "tf_1",
            "type": "true_false",
            "question": "...",
            "correctAnswer": true,
            "explanation": "..."
          }
        ],
        "fillBlanks": [],
        "codeQuestions": [],
        "scenarios": []
      }
    }
  ]
}

Requirements:
- Every MCQ must contain exactly 4 options.
- Exactly one correctAnswer index per MCQ.
- Difficulty must be easy, medium, or hard.
- Explanations must be under 120 characters.
- No markdown wrappers like \`\`\`json.
- No prose outside JSON.
- Ensure the 'source_id' perfectly matches the ITEM ID provided.`;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'user', content: prompt }
        ],
        model: env.GROQ_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.2, // Low temperature for deterministic output
        max_tokens: 950,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content returned from Groq');
      }
      
      return JSON.parse(content);
    } catch (error) {
      logger.error({ error }, 'Failed to generate knowledge cards in bulk via Groq');
      throw error;
    }
  }
}

export const groqService = new GroqService();
