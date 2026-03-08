import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

console.log("GROQ KEY LOADED:", !!process.env.GROQ_API_KEY);

const app = express();
const port = Number(process.env.PORT) || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

app.get("/health", (_req, res) => {
  res.json({ ok: true, port });
});

app.post("/api/generate-questions", async (req, res) => {
  try {
    const { material, count = 20, title = "" } = req.body ?? {};

    if (!material || !String(material).trim()) {
      return res.status(400).json({
        error: "Material text is required."
      });
    }

    const safeCount = Math.max(1, Math.min(50, Number(count) || 20));
    const safeTitle = String(title || "").trim() || "Generated Question Set";

    const prompt = `
You are generating quiz questions for a running game.

Based on the study material below, create exactly ${safeCount} multiple-choice questions.

Rules:
- Each question must have exactly 4 answer choices
- Exactly 1 correct answer
- Questions should be clear and concise
- The answer choices should be plausible
- Return ONLY valid JSON
- Do NOT include markdown
- Do NOT include any explanation text
- Use this exact schema:

{
  "title": "${safeTitle}",
  "description": "AI-generated from uploaded material",
  "questions": [
    {
      "question": "string",
      "answers": ["string", "string", "string", "string"],
      "correctIndex": 0
    }
  ]
}

Study material:
${String(material).trim()}
`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Return only valid JSON. No markdown. No explanation."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({
        error: "No response content from Groq."
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse failed. Raw content from Groq:");
      console.error(content);

      return res.status(500).json({
        error: "Groq returned invalid JSON.",
        raw: content
      });
    }

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      return res.status(500).json({
        error: "Groq JSON missing questions array.",
        raw: parsed
      });
    }

    const cleanedQuestions = parsed.questions
      .filter((q) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.answers) &&
        q.answers.length === 4 &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3
      )
      .map((q) => ({
        question: q.question.trim(),
        answers: q.answers.map((a) => String(a).trim()),
        correctIndex: q.correctIndex
      }));

    if (cleanedQuestions.length === 0) {
      return res.status(500).json({
        error: "Groq returned no valid questions.",
        raw: parsed
      });
    }

    return res.json({
      title: parsed.title || safeTitle,
      description: parsed.description || "AI-generated set",
      questions: cleanedQuestions
    });
  } catch (error) {
    console.error("Groq generation error:");
    console.error(error);

    return res.status(500).json({
      error: error?.message || "Failed to generate questions.",
      details: error?.response?.data || null
    });
  }
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
});