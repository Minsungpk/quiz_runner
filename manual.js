const STORAGE_KEY = "quizRunnerQuestionSet";
const MAX_CARDS = 20;

const cardsContainer = document.getElementById("cardsContainer");
const addCardBtn = document.getElementById("addCardBtn");
const saveSetBtn = document.getElementById("saveSetBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const setTitleInput = document.getElementById("setTitle");
const setDescriptionInput = document.getElementById("setDescription");

let cards = [];

function createEmptyCard() {
  return {
    question: "",
    answers: ["", "", "", ""],
    correctIndex: 0
  };
}

function loadSavedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderCards() {
  cardsContainer.innerHTML = "";

  cards.forEach((card, index) => {
    const el = document.createElement("section");
    el.className = "questionCard";

    el.innerHTML = `
      <div class="questionCardTop">
        <div class="cardNumber">${index + 1}</div>
        <button class="deleteCardBtn" data-index="${index}">Delete</button>
      </div>

      <div class="cardGrid">
        <div class="cardColumn">
          <label class="fieldLabel">Question</label>
          <textarea class="cardTextarea questionField" data-index="${index}" placeholder="Enter your question here...">${card.question}</textarea>
        </div>

        <div class="cardColumn">
          <label class="fieldLabel">Answers</label>
          <div class="answerStack">
            <input class="cardInput answerField" data-index="${index}" data-answer="0" type="text" placeholder="Answer 1" value="${card.answers[0]}">
            <input class="cardInput answerField" data-index="${index}" data-answer="1" type="text" placeholder="Answer 2" value="${card.answers[1]}">
            <input class="cardInput answerField" data-index="${index}" data-answer="2" type="text" placeholder="Answer 3" value="${card.answers[2]}">
            <input class="cardInput answerField" data-index="${index}" data-answer="3" type="text" placeholder="Answer 4" value="${card.answers[3]}">
          </div>

          <div class="correctRow">
            <label class="fieldLabel">Correct Answer</label>
            <select class="cardSelect correctField" data-index="${index}">
              <option value="0" ${card.correctIndex === 0 ? "selected" : ""}>Answer 1</option>
              <option value="1" ${card.correctIndex === 1 ? "selected" : ""}>Answer 2</option>
              <option value="2" ${card.correctIndex === 2 ? "selected" : ""}>Answer 3</option>
              <option value="3" ${card.correctIndex === 3 ? "selected" : ""}>Answer 4</option>
            </select>
          </div>
        </div>
      </div>
    `;

    cardsContainer.appendChild(el);
  });

  bindCardEvents();
}

function bindCardEvents() {
  document.querySelectorAll(".questionField").forEach((field) => {
    field.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.index);
      cards[i].question = e.target.value;
    });
  });

  document.querySelectorAll(".answerField").forEach((field) => {
    field.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.index);
      const a = Number(e.target.dataset.answer);
      cards[i].answers[a] = e.target.value;
    });
  });

  document.querySelectorAll(".correctField").forEach((field) => {
    field.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.index);
      cards[i].correctIndex = Number(e.target.value);
    });
  });

  document.querySelectorAll(".deleteCardBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.index);
      cards.splice(i, 1);
      renderCards();
    });
  });
}

function addCard() {
  if (cards.length >= MAX_CARDS) {
    alert(`You can add up to ${MAX_CARDS} questions.`);
    return;
  }
  cards.push(createEmptyCard());
  renderCards();
}

function validateCards() {
  if (cards.length === 0) {
    alert("Add at least 1 question first.");
    return false;
  }

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];

    if (!c.question.trim()) {
      alert(`Question ${i + 1} is empty.`);
      return false;
    }

    for (let j = 0; j < 4; j++) {
      if (!c.answers[j].trim()) {
        alert(`Question ${i + 1} has an empty answer choice.`);
        return false;
      }
    }
  }

  return true;
}

function saveSet() {
  if (!validateCards()) return;

  const payload = {
    title: setTitleInput.value.trim() || "Custom Question Set",
    description: setDescriptionInput.value.trim(),
    questions: cards.map((c) => ({
      question: c.question.trim(),
      answers: c.answers.map((a) => a.trim()),
      correctIndex: c.correctIndex
    }))
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  alert("Question set saved. The game will now use these questions.");
}

function clearAll() {
  const yes = confirm("Delete all saved questions and reset the form?");
  if (!yes) return;

  localStorage.removeItem(STORAGE_KEY);
  setTitleInput.value = "";
  setDescriptionInput.value = "";
  cards = [createEmptyCard(), createEmptyCard()];
  renderCards();
}

addCardBtn.addEventListener("click", addCard);
saveSetBtn.addEventListener("click", saveSet);
clearAllBtn.addEventListener("click", clearAll);

const saved = loadSavedSet();

if (saved && Array.isArray(saved.questions) && saved.questions.length > 0) {
  setTitleInput.value = saved.title || "";
  setDescriptionInput.value = saved.description || "";
  cards = saved.questions.map((q) => ({
    question: q.question || "",
    answers: Array.isArray(q.answers) && q.answers.length === 4 ? q.answers : ["", "", "", ""],
    correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0
  }));
} else {
  cards = [createEmptyCard(), createEmptyCard()];
}

renderCards();