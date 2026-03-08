console.log("ai.js loaded");

const STORAGE_KEY = "quizRunnerQuestionSet";

const aiSetTitle = document.getElementById("aiSetTitle");
const materialInput = document.getElementById("materialInput");
const questionCountInput = document.getElementById("questionCountInput");
const generateBtn = document.getElementById("generateBtn");
const saveGeneratedBtn = document.getElementById("saveGeneratedBtn");
const clearGeneratedBtn = document.getElementById("clearGeneratedBtn");
const statusBox = document.getElementById("statusBox");
const generatedList = document.getElementById("generatedList");

let generatedSet = null;

if (
  !aiSetTitle ||
  !materialInput ||
  !questionCountInput ||
  !generateBtn ||
  !saveGeneratedBtn ||
  !clearGeneratedBtn ||
  !statusBox ||
  !generatedList
) {
  console.error("One or more required DOM elements were not found.");
}

function renderGeneratedQuestions() {
  if (!generatedSet || !generatedSet.questions || generatedSet.questions.length === 0) {
    generatedList.innerHTML = `<div class="savedHint">No generated questions yet.</div>`;
    return;
  }

  generatedList.innerHTML = generatedSet.questions
    .map((q, index) => {
      const answers = q.answers
        .map((a, i) => {
          const mark = i === q.correctIndex ? " ✅" : "";
          return `<li>${a}${mark}</li>`;
        })
        .join("");

      return `
        <div class="questionCard" style="margin-bottom:16px;">
          <div class="questionCardTop">
            <div class="cardNumber">Q${index + 1}</div>
          </div>
          <div><strong>${q.question}</strong></div>
          <ol class="savedAnswerList">
            ${answers}
          </ol>
        </div>
      `;
    })
    .join("");
}

generateBtn?.addEventListener("click", async () => {
  console.log("Generate button clicked");

  const material = materialInput.value.trim();
  const count = Number(questionCountInput.value) || 20;
  const title = aiSetTitle.value.trim();

  if (!material) {
    statusBox.textContent = "Please paste study material first.";
    return;
  }

  statusBox.textContent = "Generating questions...";

  try {
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        material,
        count,
        title
      })
    });

    let data;
    try {
      data = await res.json();
    } catch {
      statusBox.textContent = "Server returned invalid JSON.";
      return;
    }

    console.log("Server response:", data);

    if (!res.ok) {
      statusBox.textContent = data.error || "Failed to generate questions.";
      if (data.details) console.log("Server details:", data.details);
      if (data.raw) console.log("Raw model output:", data.raw);
      return;
    }

    generatedSet = {
      title: title || data.title || "AI Generated Set",
      description: data.description || "Generated from study material",
      questions: Array.isArray(data.questions) ? data.questions : []
    };

    statusBox.textContent = `Generated ${generatedSet.questions.length} questions successfully.`;
    renderGeneratedQuestions();
  } catch (err) {
    console.error("Fetch error:", err);
    statusBox.textContent = "Server error while generating questions.";
  }
});

saveGeneratedBtn?.addEventListener("click", () => {
  console.log("Save button clicked");

  if (!generatedSet || !generatedSet.questions || generatedSet.questions.length === 0) {
    statusBox.textContent = "No generated questions to save.";
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(generatedSet));
  statusBox.textContent = "Saved. The game will use these questions.";
});

clearGeneratedBtn?.addEventListener("click", () => {
  console.log("Clear button clicked");

  generatedSet = null;
  aiSetTitle.value = "";
  materialInput.value = "";
  questionCountInput.value = "20";
  statusBox.textContent = "Cleared.";
  renderGeneratedQuestions();
});

renderGeneratedQuestions();