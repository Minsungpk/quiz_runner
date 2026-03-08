import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

// ===================== DOM =====================
const canvas = document.getElementById("game");
const scoreEl = document.getElementById("scoreValue");
const energyFillEl = document.getElementById("energyFill");
const energyTextEl = document.getElementById("energyText");
const questionEl = document.getElementById("questionText");
const overlay = document.getElementById("gameOver");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySub = document.getElementById("overlaySub");
const timeEl = document.getElementById("timeValue");
const boostFillEl = document.getElementById("boostFill");
const boostTextEl = document.getElementById("boostText");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const musicBtn = document.getElementById("musicBtn");

const bgm = document.getElementById("bgm");
const jumpSfx = document.getElementById("jumpSfx");
const boostSfx = document.getElementById("boostSfx");
const hitSfx = document.getElementById("hitSfx");

let musicEnabled = true;

// ===================== Helpers =====================
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function formatTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const t = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${t}`;
}
function aabbOverlapTrack(a, b) {
  return (
    a.u0 <= b.u1 &&
    a.u1 >= b.u0 &&
    a.y0 <= b.y1 &&
    a.y1 >= b.y0 &&
    a.s0 <= b.s1 &&
    a.s1 >= b.s0
  );
}
function safePlay(audio, volume = 1, restart = false) {
  if (!audio) return;
  audio.volume = volume;
  if (restart) {
    try {
      audio.currentTime = 0;
    } catch {}
  }
  audio.play().catch(() => {});
}
function safePause(audio) {
  if (!audio) return;
  audio.pause();
}
function trackBox(u0, u1, y0, y1, s0, s1) {
  return { u0, u1, y0, y1, s0, s1 };
}

// ===================== Config =====================
const MAX_ENERGY = 100;
let totalQuestions = 20;

const TRACK_WIDTH = 14;
const RUN_SPEED = 60;
const STRAFE_SPEED = 18;
const BOOST_MULT = 1.6;
const BOOST_MAX = 4.0;
const BOOST_DRAIN = BOOST_MAX / 4.0;
const BOOST_REGEN = BOOST_MAX / 4.0;
const BOOST_RECHARGE_UNLOCK = 1.0;

const GRAVITY = 24;
const JUMP_1 = 9.5;
const JUMP_2 = 8.2;
const PLAYER_HEIGHT = 2.0;
const PLAYER_HALF = PLAYER_HEIGHT / 2;
const PLAYER_RADIUS = 0.45;

const MAX_STEP_UP = 0.22;

const FALL_PENALTY = 25;
const HURDLE_PENALTY = 15;
const WRONG_DOOR_PENALTY = 20;

const SAFE_BEFORE_GATE = 28;
const SAFE_AFTER_GATE = 42;

const DOOR_U = [-5.4, -1.8, 1.8, 5.4];
const DOOR_OPEN_W = 3.4;

// Real hurdle dimensions
const HURDLE_TOTAL_WIDTH = TRACK_WIDTH - 2.2;
const HURDLE_HEIGHT = 1.15;
const HURDLE_BAR_THICK = 0.12;
const HURDLE_LEG_THICK = 0.12;
const HURDLE_DEPTH = 0.22;

const QUESTION_STORAGE_KEY = "quizRunnerQuestionSet";
let customQuestions = [];
let customQuestionIndex = 0;

function loadCustomQuestions() {
  customQuestions = [];
  totalQuestions = 20;

  try {
    const raw = localStorage.getItem(QUESTION_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);

    if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      customQuestions = parsed.questions
        .filter((q) =>
          q &&
          typeof q.question === "string" &&
          Array.isArray(q.answers) &&
          q.answers.length === 4 &&
          Number.isInteger(q.correctIndex)
        )
        .map((q) => ({
          text: q.question,
          answers: q.answers,
          correctDoor: q.correctIndex
        }));

      if (customQuestions.length > 0) {
        totalQuestions = customQuestions.length;
      }
    }
  } catch {
    customQuestions = [];
    totalQuestions = 20;
  }
}

// ===================== State =====================
let state = "playing";
let energy = MAX_ENERGY;
let score = 0;
let elapsedMs = 0;
let boost = BOOST_MAX;

let jumpsLeft = 2;
let jumpQueued = 0;

let questionCount = 0;
let currentQuestion = null;
let activeGateS = null;
let nextGateS = 100;

let finishCreated = false;
let finishObj = null;

let audioUnlocked = false;
let boostSoundOn = false;
let runCycle = 0;
let boostLocked = false;

// ===================== Input =====================
const keys = new Set();

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  if (bgm && musicEnabled) {
    safePlay(bgm, 0.32, false);
  }

  if (boostSfx) {
    boostSfx.volume = 0.18;
  }
}

window.addEventListener("pointerdown", unlockAudio, { once: true });

window.addEventListener("keydown", (e) => {
  unlockAudio();

  const k = e.key.toLowerCase();
  keys.add(k);

  if ((k === " " || k === "space") && !e.repeat) {
    jumpQueued++;
  }

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

fullscreenBtn?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {}
});

if (musicBtn) {
  musicBtn.addEventListener("click", () => {

    musicEnabled = !musicEnabled;

    if (musicEnabled) {
      bgm.play().catch(() => {});
      musicBtn.textContent = "Music: ON";
    } else {
      bgm.pause();
      musicBtn.textContent = "Music: OFF";
    }

  });
}

// ===================== Three =====================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaed8ff);
scene.fog = new THREE.Fog(0xaed8ff, 55, 340);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

scene.add(new THREE.HemisphereLight(0xdff4ff, 0x6e8f5e, 1.15));

const dir = new THREE.DirectionalLight(0xffffff, 1.15);
dir.position.set(20, 28, -12);
dir.castShadow = true;
scene.add(dir);

// ===================== Materials =====================
const matFloor = new THREE.MeshStandardMaterial({ color: 0x77583d, roughness: 0.95, metalness: 0.02 });
const matEdge = new THREE.MeshStandardMaterial({ color: 0x5a4635, roughness: 0.85, metalness: 0.02 });
const matGrass = new THREE.MeshStandardMaterial({ color: 0x66b24f, roughness: 1.0, metalness: 0.0 });
const matGrassDark = new THREE.MeshStandardMaterial({ color: 0x4a8c39, roughness: 1.0, metalness: 0.0 });
const matTreeTrunk = new THREE.MeshStandardMaterial({ color: 0x6b4b2a, roughness: 1.0, metalness: 0.0 });
const matLeaves = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 1.0, metalness: 0.0 });
const matLeaves2 = new THREE.MeshStandardMaterial({ color: 0x3e9e44, roughness: 1.0, metalness: 0.0 });
const matRock = new THREE.MeshStandardMaterial({ color: 0x8f938f, roughness: 1.0, metalness: 0.0 });
const matMountain = new THREE.MeshStandardMaterial({ color: 0x7ea08a, roughness: 1.0, metalness: 0.0 });

const matDoor = new THREE.MeshStandardMaterial({
  color: 0x2f3f66,   
  roughness: 0.45,
  metalness: 0.28,
  emissive: new THREE.Color(0x000000),
  emissiveIntensity: 0
});

const matHurdleTop = new THREE.MeshStandardMaterial({
  color: 0xff5f5f,
  roughness: 0.55,
  metalness: 0.05
});

const matHurdleSide = new THREE.MeshStandardMaterial({
  color: 0xe7edf7,
  roughness: 0.7,
  metalness: 0.15
});

const matFinish = new THREE.MeshStandardMaterial({
  color: 0x7cffd5,
  roughness: 0.35,
  metalness: 0.35,
  emissive: new THREE.Color(0x0a1026),
  emissiveIntensity: 0.55
});

const matSkin = new THREE.MeshStandardMaterial({
  color: 0xf2c7a5,
  roughness: 0.9,
  metalness: 0.02
});

const matShirt = new THREE.MeshStandardMaterial({
  color: 0x4a7dff,
  roughness: 0.85,
  metalness: 0.03
});

const matShorts = new THREE.MeshStandardMaterial({
  color: 0x1f2b3f,
  roughness: 0.9,
  metalness: 0.02
});

const matLeg = new THREE.MeshStandardMaterial({
  color: 0x293041,
  roughness: 0.95,
  metalness: 0.03
});

const matShoe = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.85,
  metalness: 0.02
});

// ===================== Player Physics =====================
const player = {
  u: 0,
  s: 0,
  y: 2,
  vu: 0,
  vs: 0,
  vy: 0,
  grounded: false,
  checkpointU: 0,
  checkpointS: 0
};

// ===================== Player Visual =====================
const playerGroup = new THREE.Group();
scene.add(playerGroup);

const character = new THREE.Group();
playerGroup.add(character);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 20, 20),
  matSkin
);
head.position.set(0, 1.55, 0);
head.castShadow = true;
character.add(head);

const torso = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.68, 0.28),
  matShirt
);
torso.position.set(0, 1.02, 0);
torso.castShadow = true;
character.add(torso);

const hips = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.24, 0.24),
  matShorts
);
hips.position.set(0, 0.62, 0);
hips.castShadow = true;
character.add(hips);

const leftArmPivot = new THREE.Group();
leftArmPivot.position.set(-0.33, 1.28, 0);
character.add(leftArmPivot);

const rightArmPivot = new THREE.Group();
rightArmPivot.position.set(0.33, 1.28, 0);
character.add(rightArmPivot);

const leftArm = new THREE.Mesh(
  new THREE.BoxGeometry(0.14, 0.58, 0.14),
  matSkin
);
leftArm.position.y = -0.28;
leftArm.castShadow = true;
leftArmPivot.add(leftArm);

const rightArm = new THREE.Mesh(
  new THREE.BoxGeometry(0.14, 0.58, 0.14),
  matSkin
);
rightArm.position.y = -0.28;
rightArm.castShadow = true;
rightArmPivot.add(rightArm);

const leftLegPivot = new THREE.Group();
leftLegPivot.position.set(-0.14, 0.52, 0);
character.add(leftLegPivot);

const rightLegPivot = new THREE.Group();
rightLegPivot.position.set(0.14, 0.52, 0);
character.add(rightLegPivot);

const leftLeg = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.72, 0.16),
  matLeg
);
leftLeg.position.y = -0.36;
leftLeg.castShadow = true;
leftLegPivot.add(leftLeg);

const rightLeg = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.72, 0.16),
  matLeg
);
rightLeg.position.y = -0.36;
rightLeg.castShadow = true;
rightLegPivot.add(rightLeg);

const leftShoe = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.08, 0.30),
  matShoe
);
leftShoe.position.set(0, -0.74, 0.06);
leftShoe.castShadow = true;
leftLegPivot.add(leftShoe);

const rightShoe = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.08, 0.30),
  matShoe
);
rightShoe.position.set(0, -0.74, 0.06);
rightShoe.castShadow = true;
rightLegPivot.add(rightShoe);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.65, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.20 })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.05;
playerGroup.add(shadow);

// ===================== Straight Track Space =====================
function trackToWorld(u, y, s) {
  return new THREE.Vector3(u, y, s);
}

// ===================== World Objects =====================
const platforms = [];
const stairBlockers = [];
const hurdles = [];
const doors = [];
const gateBlockers = [];
const safeZones = [];
const scenery = [];

let nextBuildS = 0;

function addSafeZone(s0, s1) {
  safeZones.push({ s0, s1 });
}
function intersectsSafe(s0, s1) {
  for (const z of safeZones) {
    if (s0 <= z.s1 && s1 >= z.s0) return true;
  }
  return false;
}
function groundTopY(u, s) {
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    if (u >= p.u0 && u <= p.u1 && s >= p.s0 && s <= p.s1) {
      return p.topY;
    }
  }
  return null;
}

function addSceneryObject(obj) {
  scene.add(obj);
  scenery.push(obj);
}

function addGrassStrip(uCenter, s0, s1, topY, width, material) {
  const len = s1 - s0;
  const geo = new THREE.BoxGeometry(width, 0.32, len);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.position.copy(trackToWorld(uCenter, topY - 0.34, (s0 + s1) / 2));
  addSceneryObject(mesh);
}

function addTree(u, s, y, scale = 1) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.26 * scale, 1.9 * scale, 8),
    matTreeTrunk
  );
  trunk.position.y = y + 0.95 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const leaves1 = new THREE.Mesh(
    new THREE.ConeGeometry(1.0 * scale, 1.8 * scale, 10),
    Math.random() < 0.5 ? matLeaves : matLeaves2
  );
  leaves1.position.y = y + 2.0 * scale;
  leaves1.castShadow = true;
  tree.add(leaves1);

  const leaves2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.78 * scale, 1.35 * scale, 10),
    Math.random() < 0.5 ? matLeaves : matLeaves2
  );
  leaves2.position.y = y + 2.85 * scale;
  leaves2.castShadow = true;
  tree.add(leaves2);

  tree.position.set(u, 0, s);
  addSceneryObject(tree);
}

function addRock(u, s, y, scale = 1) {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.55 * scale, 0),
    matRock
  );
  rock.position.copy(trackToWorld(u, y + 0.35 * scale, s));
  rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  rock.castShadow = true;
  rock.receiveShadow = true;
  addSceneryObject(rock);
}

function addMountain(u, s, scale = 1) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(7 * scale, 16 * scale, 7),
    matMountain
  );
  m.position.copy(trackToWorld(u, 8 * scale - 0.5, s));
  m.castShadow = false;
  m.receiveShadow = true;
  addSceneryObject(m);
}

function addNatureDecor(s0, s1, topY) {
  const leftGrassCenter = -TRACK_WIDTH / 2 - 6;
  const rightGrassCenter = TRACK_WIDTH / 2 + 6;

  addGrassStrip(leftGrassCenter, s0, s1, topY, 10, matGrass);
  addGrassStrip(rightGrassCenter, s0, s1, topY, 10, matGrassDark);

  let s = s0 + rand(6, 14);
  while (s < s1 - 6) {
    if (Math.random() < 0.78) {
      const leftU = -(TRACK_WIDTH / 2 + rand(4.2, 9.5));
      addTree(leftU, s + rand(-2, 2), topY - 0.02, rand(0.8, 1.45));
    } else {
      addRock(-(TRACK_WIDTH / 2 + rand(4.5, 9)), s + rand(-2, 2), topY - 0.05, rand(0.6, 1.15));
    }

    if (Math.random() < 0.78) {
      const rightU = TRACK_WIDTH / 2 + rand(4.2, 9.5);
      addTree(rightU, s + rand(-2, 2), topY - 0.02, rand(0.8, 1.45));
    } else {
      addRock(TRACK_WIDTH / 2 + rand(4.5, 9), s + rand(-2, 2), topY - 0.05, rand(0.6, 1.15));
    }

    s += rand(11, 18);
  }

  if (Math.random() < 0.65) addMountain(-rand(36, 62), (s0 + s1) / 2 + rand(-12, 12), rand(1.4, 2.4));
  if (Math.random() < 0.65) addMountain(rand(36, 62), (s0 + s1) / 2 + rand(-12, 12), rand(1.4, 2.4));
}

function addPlatform(s0, len, topY) {
  const s1 = s0 + len;

  const geo = new THREE.BoxGeometry(TRACK_WIDTH, 1, len);
  const mesh = new THREE.Mesh(geo, matFloor);
  mesh.receiveShadow = true;
  mesh.position.copy(trackToWorld(0, topY - 0.5, (s0 + s1) / 2));
  scene.add(mesh);

  const railGeo = new THREE.BoxGeometry(0.5, 1.2, len);

  const leftRail = new THREE.Mesh(railGeo, matEdge);
  leftRail.receiveShadow = true;
  leftRail.position.copy(trackToWorld(-TRACK_WIDTH / 2 - 0.25, topY - 0.4, (s0 + s1) / 2));
  scene.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo, matEdge);
  rightRail.receiveShadow = true;
  rightRail.position.copy(trackToWorld(TRACK_WIDTH / 2 + 0.25, topY - 0.4, (s0 + s1) / 2));
  scene.add(rightRail);

  platforms.push({
    u0: -TRACK_WIDTH / 2,
    u1: TRACK_WIDTH / 2,
    s0,
    s1,
    topY,
    mesh,
    rails: [leftRail, rightRail]
  });

  addNatureDecor(s0, s1, topY);

  return s1;
}

function addStairFrontBlocker(stepS0, stepTopY) {
  stairBlockers.push({
    u0: -TRACK_WIDTH / 2,
    u1: TRACK_WIDTH / 2,
    s0: stepS0 - 0.25,
    s1: stepS0 + 0.25,
    y0: 0,
    y1: stepTopY
  });
}

function spawnHurdleBar(s) {
  const hurdle = new THREE.Group();

  const leftLegMesh = new THREE.Mesh(
    new THREE.BoxGeometry(HURDLE_LEG_THICK, 1.0, HURDLE_DEPTH),
    matHurdleSide
  );
  leftLegMesh.position.set(-HURDLE_TOTAL_WIDTH / 2, 0.5, 0);
  leftLegMesh.castShadow = true;
  hurdle.add(leftLegMesh);

  const rightLegMesh = new THREE.Mesh(
    new THREE.BoxGeometry(HURDLE_LEG_THICK, 1.0, HURDLE_DEPTH),
    matHurdleSide
  );
  rightLegMesh.position.set(HURDLE_TOTAL_WIDTH / 2, 0.5, 0);
  rightLegMesh.castShadow = true;
  hurdle.add(rightLegMesh);

  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(HURDLE_TOTAL_WIDTH, HURDLE_BAR_THICK, HURDLE_DEPTH),
    matHurdleTop
  );
  topBar.position.set(0, HURDLE_HEIGHT, 0);
  topBar.castShadow = true;
  hurdle.add(topBar);

  const lowerBar = new THREE.Mesh(
    new THREE.BoxGeometry(HURDLE_TOTAL_WIDTH * 0.92, 0.08, HURDLE_DEPTH * 0.8),
    matHurdleSide
  );
  lowerBar.position.set(0, 0.38, 0);
  lowerBar.castShadow = true;
  hurdle.add(lowerBar);

  hurdle.position.copy(trackToWorld(0, 0, s));
  scene.add(hurdle);

  hurdles.push({
    mesh: hurdle,
    hit: false,
    box: trackBox(
      -HURDLE_TOTAL_WIDTH / 2,
      HURDLE_TOTAL_WIDTH / 2,
      0,
      HURDLE_HEIGHT + 0.08,
      s - 0.24,
      s + 0.24
    )
  });
}

function makeQuestion() {
  if (customQuestions.length > 0) {
    if (customQuestionIndex >= customQuestions.length) {
      return null;
    }

    const q = customQuestions[customQuestionIndex];
    customQuestionIndex++;

    return {
      text: q.text,
      answers: q.answers,
      correctDoor: q.correctDoor
    };
  }

  const a = randInt(1, 20);
  const b = randInt(1, 20);
  const correct = a + b;

  const wrong = new Set();
  while (wrong.size < 3) {
    const w = correct + randInt(-8, 8);
    if (w > 0 && w !== correct) wrong.add(w);
  }

  const answers = [correct, ...wrong];
  shuffle(answers);

  return {
    text: `${a} + ${b} = ?`,
    answers,
    correctDoor: answers.indexOf(correct)
  };
}

function makeTextSprite(text, big = false) {
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d");

  cvs.width = 512;
  cvs.height = 256;

  ctx.fillStyle = "rgba(10,14,26,0.78)";
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, cvs.width - 24, cvs.height - 24);

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = cvs.width - 50;
  const maxLines = big ? 2 : 3;

  let fontSize = big ? 88 : 54;
  let lines = [];

  function wrapText(fontPx) {
    ctx.font = `900 ${fontPx}px system-ui, Arial`;

    const words = String(text).split(" ");
    const wrapped = [];
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const w = ctx.measureText(testLine).width;

      if (w > maxWidth && line) {
        wrapped.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) wrapped.push(line);
    return wrapped;
  }

  while (fontSize >= 22) {
    lines = wrapText(fontSize);

    const tooWide = lines.some(line => ctx.measureText(line).width > maxWidth);
    const tooManyLines = lines.length > maxLines;

    if (!tooWide && !tooManyLines) break;

    fontSize -= 4;
  }

  ctx.font = `900 ${fontSize}px system-ui, Arial`;

  const lineHeight = fontSize * 1.15;
  const totalHeight = lines.length * lineHeight;
  let y = cvs.height / 2 - totalHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    ctx.fillText(line, cvs.width / 2, y);
    y += lineHeight;
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.anisotropy = 8;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true
  });

  const spr = new THREE.Sprite(mat);
  spr.scale.set(big ? 7.0 : 4.6, big ? 2.8 : 2.5, 1);

  return spr;
}

function makeDoorTextMaterial(text) {
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d");

  cvs.width = 1024;
  cvs.height = 1024;

  // DARK background for strong contrast
  ctx.fillStyle = "#1a1f3a";
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  // bright border
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 20;
  ctx.strokeRect(30, 30, cvs.width - 60, cvs.height - 60);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = cvs.width - 120;
  const maxLines = 3;

  // MUCH bigger font
  let fontSize = 140;
  let lines = [];

  function wrapText(size) {
    ctx.font = `900 ${size}px Arial`;
    const words = String(text).split(" ");
    const wrapped = [];
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const w = ctx.measureText(test).width;

      if (w > maxWidth && line) {
        wrapped.push(line);
        line = word;
      } else {
        line = test;
      }
    }

    if (line) wrapped.push(line);
    return wrapped;
  }

  while (fontSize >= 60) {
    lines = wrapText(fontSize);
    if (lines.length <= maxLines) break;
    fontSize -= 10;
  }

  ctx.font = `900 ${fontSize}px Arial`;

  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  let y = cvs.height / 2 - totalHeight / 2 + lineHeight / 2;

  for (const line of lines) {

    // THICK BLACK OUTLINE
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 22;
    ctx.strokeText(line, cvs.width / 2, y);

    // PURE WHITE TEXT
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, cvs.width / 2, y);

    y += lineHeight;
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  return new THREE.MeshBasicMaterial({
    map: tex
  });
}

function clearGate() {
  for (const d of doors) {
    scene.remove(d.mesh);
    if (d.label) scene.remove(d.label);
  }
  doors.length = 0;

  for (const b of gateBlockers) {
    scene.remove(b.mesh);
  }
  gateBlockers.length = 0;
}

function buildGateBlockers(sGate) {
  const wallH = 5.3;
  const wallT = 1.0;

  const openings = DOOR_U
    .map(u => ({ uL: u - DOOR_OPEN_W / 2, uR: u + DOOR_OPEN_W / 2 }))
    .sort((a, b) => a.uL - b.uL);

  const segs = [];
  let cursor = -TRACK_WIDTH / 2 + 0.35;
  const maxU = TRACK_WIDTH / 2 - 0.35;

  for (const o of openings) {
    if (o.uL - cursor > 0.2) segs.push({ u0: cursor, u1: o.uL });
    cursor = o.uR;
  }
  if (maxU - cursor > 0.2) segs.push({ u0: cursor, u1: maxU });

  for (const seg of segs) {
    const w = seg.u1 - seg.u0;
    const uMid = (seg.u0 + seg.u1) / 2;

    const geo = new THREE.BoxGeometry(w, wallH, wallT);
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(trackToWorld(uMid, wallH / 2, sGate));
    scene.add(mesh);

    gateBlockers.push({
      mesh,
      box: trackBox(seg.u0, seg.u1, 0, wallH, sGate - wallT / 2, sGate + wallT / 2)
    });
  }
}

function spawnGate(sGate) {
  clearGate();

  currentQuestion = makeQuestion();
  if (!currentQuestion) {
    activeGateS = null;
    return;
  }

  activeGateS = sGate;

  addSafeZone(sGate - SAFE_BEFORE_GATE, sGate + SAFE_AFTER_GATE);
  questionEl.textContent = `Q${questionCount + 1}/${totalQuestions} — ${currentQuestion.text}`;

  buildGateBlockers(sGate);

  const topY = groundTopY(0, sGate) ?? 0.5;

  for (let i = 0; i < 4; i++) {
    const doorGeo = new THREE.BoxGeometry(3.2, 4.8, 0.6);

    const doorTextMat = makeDoorTextMaterial(currentQuestion.answers[i]);

    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x1c2240,
      roughness: 0.5,
      metalness: 0.18,
      emissive: new THREE.Color(0x0a1026),
      emissiveIntensity: 0.18
    });

    const mesh = new THREE.Mesh(doorGeo, [
      sideMat,     // right
      sideMat,     // left
      sideMat,     // top
      sideMat,     // bottom
      doorTextMat, // front
      doorTextMat  // back
    ]);

    mesh.castShadow = true;
    mesh.position.copy(trackToWorld(DOOR_U[i], topY + 2.4, sGate));
    scene.add(mesh);

    doors.push({
      idx: i,
      mesh,
      label: null,
      box: trackBox(
        DOOR_U[i] - 1.6,
        DOOR_U[i] + 1.6,
        topY,
        topY + 4.8,
        sGate - 0.35,
        sGate + 0.35
      )
    });
  }
}

function createFinish(s) {
  addSafeZone(s - 40, s + 70);
  const topY = groundTopY(0, s) ?? 0.5;

  const geo = new THREE.BoxGeometry(TRACK_WIDTH - 0.6, 0.4, 1.2);
  const mesh = new THREE.Mesh(geo, matFinish);
  mesh.castShadow = true;
  mesh.position.copy(trackToWorld(0, topY + 3.8, s));
  scene.add(mesh);

  const label = makeTextSprite("FINISH", true);
  label.position.copy(trackToWorld(0, topY + 6.4, s));
  scene.add(label);

  finishObj = {
    mesh,
    label,
    box: trackBox(
      -TRACK_WIDTH / 2,
      TRACK_WIDTH / 2,
      topY,
      topY + 8,
      s - 0.8,
      s + 0.8
    )
  };
}

// ---------- World generation ----------
function buildAhead(targetS) {
  while (nextBuildS < targetS) {
    const roll = Math.random();

    if (roll < 0.18) {
      const stepCount = randInt(6, 11);
      const stepLen = 3.6;
      const stepRise = rand(0.35, 0.48);
      let s = nextBuildS;
      const baseY = 0.5;

      for (let i = 0; i < stepCount; i++) {
        const topY = baseY + i * stepRise;
        addStairFrontBlocker(s, topY);
        s = addPlatform(s, stepLen, topY);
      }

      const runway = randInt(20, 40);
      s = addPlatform(s, runway, baseY + (stepCount - 1) * stepRise);

      nextBuildS = s;
      continue;
    }

    const seconds = rand(6.0, 9.0);
    const segLen = clamp(seconds * RUN_SPEED, 42, 95);
    const s0 = nextBuildS;
    const s1 = addPlatform(s0, segLen, 0.5);

    const hN = randInt(0, 2) + (segLen > 70 ? 1 : 0);
    for (let i = 0; i < hN; i++) {
      const hs = s0 + rand(14, Math.max(18, segLen - 12));
      spawnHurdleBar(hs);
    }

    let gap = 0;
    const r = Math.random();
    if (r < 0.55) gap = 0;
    else if (r < 0.90) gap = randInt(6, 20);
    else gap = randInt(16, 28);

    if (gap > 0) {
      const g0 = s1;
      const g1 = s1 + gap;
      if (intersectsSafe(g0, g1)) gap = 0;
    }

    nextBuildS = s1 + gap;
  }
}

// ---------- Restart / Boost Sound ----------
function stopBoostSound() {
  if (boostSoundOn) {
    boostSoundOn = false;
    safePause(boostSfx);
    if (boostSfx) {
      try {
        boostSfx.currentTime = 0;
      } catch {}
    }
  }
}

function restart() {

  customQuestionIndex = 0;
  loadCustomQuestions();

  state = "playing";
  energy = MAX_ENERGY;
  score = 0;
  elapsedMs = 0;
  boost = BOOST_MAX;
  boostLocked = false;
  runCycle = 0;

  stopBoostSound();

  jumpsLeft = 2;
  jumpQueued = 0;

  questionCount = 0;
  currentQuestion = null;
  activeGateS = null;
  nextGateS = 100;

  finishCreated = false;
  if (finishObj) {
    scene.remove(finishObj.mesh);
    scene.remove(finishObj.label);
    finishObj = null;
  }

  for (const p of platforms) {
    scene.remove(p.mesh);
    scene.remove(p.rails[0]);
    scene.remove(p.rails[1]);
  }
  platforms.length = 0;

  for (const h of hurdles) scene.remove(h.mesh);
  hurdles.length = 0;

  for (const obj of scenery) scene.remove(obj);
  scenery.length = 0;

  stairBlockers.length = 0;
  safeZones.length = 0;
  clearGate();

  player.u = 0;
  player.s = 0;
  player.y = 2;
  player.vu = 0;
  player.vs = 0;
  player.vy = 0;
  player.grounded = false;
  player.checkpointU = 0;
  player.checkpointS = 0;

  nextBuildS = 0;
  overlay.classList.add("hidden");

  buildAhead(260);
  questionEl.textContent = "Get ready... First question soon!";
  updateHUD();
}

// ---------- Player box ----------
function playerBox() {
  return trackBox(
    player.u - PLAYER_RADIUS,
    player.u + PLAYER_RADIUS,
    player.y - PLAYER_HALF,
    player.y + PLAYER_HALF,
    player.s - PLAYER_RADIUS,
    player.s + PLAYER_RADIUS
  );
}

// ---------- Camera ----------
function updateCamera() {
  const desired = new THREE.Vector3(player.u, 6.5, player.s - 13);
  camera.position.lerp(desired, 0.1);
  camera.lookAt(player.u, 2.4, player.s + 12);
}

// ---------- Overlay states ----------
function setGameOver() {
  stopBoostSound();
  state = "gameover";
  overlayTitle.textContent = "GAME OVER";
  overlaySub.textContent = "Press R to restart";
  overlay.classList.remove("hidden");
}

function setFinished() {
  stopBoostSound();
  state = "finished";
  overlayTitle.textContent = "FINISH!";
  overlaySub.textContent = `Time: ${formatTime(elapsedMs)}   Score: ${score}   (R to restart)`;
  overlay.classList.remove("hidden");
}

// ---------- Loop ----------
let last = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (keys.has("r") || keys.has("ㅁ")) {
    keys.delete("r");
    keys.delete("ㅁ");
    restart();
    return;
  }

  if (state !== "playing") {
    stopBoostSound();
    playerGroup.position.copy(trackToWorld(player.u, player.y, player.s));
    updateCamera();
    renderer.render(scene, camera);
    updateHUD();
    return;
  }

  elapsedMs += dt * 1000;

  buildAhead(player.s + 260);

  if (questionCount >= totalQuestions && !finishCreated) {
    const finishS = player.s + 120;
    createFinish(finishS);
    finishCreated = true;
    clearGate();
    activeGateS = null;
    currentQuestion = null;
    questionEl.textContent = "RUN TO THE FINISH! 🏁";
  }

  if (questionCount < totalQuestions && activeGateS === null) {
    nextGateS = Math.max(nextGateS, player.s + 90);
    nextGateS += rand(85, 120);
    spawnGate(nextGateS);
  }

  const forward = (keys.has("w") || keys.has("arrowup")) ? 1 : 0;
  const back = (keys.has("s") || keys.has("arrowdown")) ? 1 : 0;
  const left = (keys.has("a") || keys.has("arrowleft")) ? 1 : 0;
  const right = (keys.has("d") || keys.has("arrowright")) ? 1 : 0;

  let ms = forward - back;
  let mu = left - right;

  const mag = Math.hypot(ms, mu);
  if (mag > 1e-6) {
    ms /= mag;
    mu /= mag;
  }

  if (boostLocked && boost >= BOOST_RECHARGE_UNLOCK) {
    boostLocked = false;
  }

  const wantsBoost = keys.has("shift") && (Math.abs(ms) > 0.05 || Math.abs(mu) > 0.05);

  let boosting = false;

  if (wantsBoost && !boostLocked && boost > 0.001) {
    boosting = true;
    boost = Math.max(0, boost - BOOST_DRAIN * dt);

    if (boost <= 0.0001) {
      boost = 0;
      boosting = false;
      boostLocked = true;
    }
  } else {
    boost = Math.min(BOOST_MAX, boost + BOOST_REGEN * dt);
  }

  const boostMul = boosting ? BOOST_MULT : 1.0;

  if (boosting && audioUnlocked) {
    if (!boostSoundOn) {
      boostSoundOn = true;
      safePlay(boostSfx, 0.18, false);
    }
  } else {
    stopBoostSound();
  }

  if (jumpQueued > 0) {
    jumpQueued--;
    if (jumpsLeft > 0) {
      if (player.vy < 0) player.vy = 0;
      player.vy = (jumpsLeft === 2) ? JUMP_1 : JUMP_2;
      player.grounded = false;
      jumpsLeft--;

      if (audioUnlocked) {
        safePlay(jumpSfx, 0.35, true);
      }
    }
  }

  const control = player.grounded ? 1.0 : 0.55;
  const targetVS = ms * RUN_SPEED * control * boostMul;
  const targetVU = mu * STRAFE_SPEED * control * boostMul;

  const accel = player.grounded ? (boosting ? 36 : 26) : 12;
  player.vs += (targetVS - player.vs) * (1 - Math.exp(-accel * dt));
  player.vu += (targetVU - player.vu) * (1 - Math.exp(-accel * dt));

  player.vy -= GRAVITY * dt;

  player.s += player.vs * dt;
  player.u += player.vu * dt;
  player.y += player.vy * dt;

  player.u = clamp(player.u, -TRACK_WIDTH / 2 + 0.7, TRACK_WIDTH / 2 - 0.7);

  const pBox0 = playerBox();

  for (const b of stairBlockers) {
    if (aabbOverlapTrack(pBox0, b)) {
      const feetY = player.y - PLAYER_HALF;
      if (feetY < b.y1 - 0.02 && player.vs > 0) {
        player.s -= Math.max(0.8, Math.abs(player.vs) * dt + 0.25);
        player.vs = 0;
      }
    }
  }

  const gY = groundTopY(player.u, player.s);
  if (gY !== null) {
    const footY = player.y - PLAYER_HALF;
    const desiredFootY = gY + 0.02;
    const stepUp = desiredFootY - footY;

    if (footY <= desiredFootY && player.vy <= 0 && stepUp <= MAX_STEP_UP) {
      player.y = desiredFootY + PLAYER_HALF;
      player.vy = 0;
      player.grounded = true;
      jumpsLeft = 2;
      jumpQueued = 0;

      if (player.s > player.checkpointS + 26) {
        player.checkpointS = player.s;
        player.checkpointU = player.u;
      }
    } else {
      player.grounded = false;
    }
  } else {
    player.grounded = false;
  }

  if (player.y < -12) {
    energy = Math.max(0, energy - FALL_PENALTY);

    if (audioUnlocked) {
      safePlay(hitSfx, 0.42, true);
    }

    if (energy === 0) {
      setGameOver();
    } else {
      player.s = player.checkpointS;
      player.u = player.checkpointU;
      player.y = 3;
      player.vu = 0;
      player.vs = 0;
      player.vy = 0;
      player.grounded = false;
      jumpsLeft = 2;
      jumpQueued = 0;
    }
  }

  const pBox = playerBox();

  for (const h of hurdles) {
    if (h.hit) continue;

    if (aabbOverlapTrack(pBox, h.box)) {
      const feet = player.y - PLAYER_HALF;
      const highEnough = feet > HURDLE_HEIGHT - 0.10;

      if (!highEnough) {
        h.hit = true;
        energy = Math.max(0, energy - HURDLE_PENALTY);

        if (audioUnlocked) {
          safePlay(hitSfx, 0.42, true);
        }

        if (energy === 0) {
          setGameOver();
        } else {
          player.s -= 2.0;
          player.vs *= 0.2;
        }
      }
    }
  }

  for (const b of gateBlockers) {
    if (aabbOverlapTrack(pBox, b.box)) {
      player.s -= 0.9;
      if (player.vs > 0) player.vs = 0;
    }
  }

  if (currentQuestion && activeGateS !== null && doors.length === 4) {
    if (player.s < activeGateS && (activeGateS - player.s) < 80) {
      questionEl.textContent = `Q${questionCount + 1}/${totalQuestions} — ${currentQuestion.text}`;
    }

    if (Math.abs(player.s - activeGateS) < 1.3) {
      let chosen = -1;

      for (const d of doors) {
        if (aabbOverlapTrack(pBox, d.box)) {
          chosen = d.idx;
          break;
        }
      }

      if (chosen !== -1) {
        if (chosen === currentQuestion.correctDoor) {
          score += 10;
        } else {
          energy = Math.max(0, energy - WRONG_DOOR_PENALTY);
          if (audioUnlocked) {
            safePlay(hitSfx, 0.35, true);
          }
          if (energy === 0) setGameOver();
        }

        questionCount++;
        clearGate();
        currentQuestion = null;
        activeGateS = null;

        if (questionCount < totalQuestions) {
          questionEl.textContent = `Good! Next question soon... (${questionCount}/${totalQuestions})`;
        } else {
          questionEl.textContent = "All questions done! Finish line incoming...";
        }
      }
    }
  }

  if (finishObj && aabbOverlapTrack(pBox, finishObj.box)) {
    setFinished();
  }

  // ---------- Human running animation ----------
  const moveSpeed = Math.hypot(player.vs, player.vu);
  const runningAmount = clamp(moveSpeed / (RUN_SPEED * BOOST_MULT), 0, 1);

  if (runningAmount > 0.02) {
    runCycle += dt * (8 + moveSpeed * 0.18);
  }

  const bob = player.grounded ? Math.sin(runCycle * 2) * 0.06 * runningAmount : 0.02;
  const lean = player.grounded ? (-0.16 * runningAmount) : 0.22;
  const legSwing = player.grounded ? Math.sin(runCycle * 2) * 0.95 * runningAmount : 0.12;
  const armSwing = player.grounded ? Math.sin(runCycle * 2) * 0.85 * runningAmount : 0.08;

  character.position.y = bob;
  character.rotation.x = THREE.MathUtils.lerp(character.rotation.x, lean, 0.14);
  character.rotation.z = THREE.MathUtils.lerp(character.rotation.z, -player.vu * 0.02, 0.12);

  leftLegPivot.rotation.x = legSwing;
  rightLegPivot.rotation.x = -legSwing;
  leftArmPivot.rotation.x = -armSwing;
  rightArmPivot.rotation.x = armSwing;

  const shadowScale = 1 + runningAmount * 0.08;
  shadow.scale.set(shadowScale, shadowScale, 1);

  playerGroup.position.copy(trackToWorld(player.u, player.y, player.s));

  updateCamera();
  updateHUD();
  renderer.render(scene, camera);
}

function updateHUD() {
  scoreEl.textContent = String(score);

  energyTextEl.textContent = `${energy} / ${MAX_ENERGY}`;
  const ep = clamp((energy / MAX_ENERGY) * 100, 0, 100);
  energyFillEl.style.width = `${ep}%`;
  energyFillEl.style.background =
    ep <= 30 ? "rgba(255,120,120,0.95)" : "rgba(120,220,160,0.95)";

  timeEl.textContent = formatTime(elapsedMs);

  const bp = clamp((boost / BOOST_MAX) * 100, 0, 100);
  boostFillEl.style.width = `${bp}%`;

  if (boostLocked) {
    boostFillEl.style.background = "rgba(255,120,120,0.95)";
  } else {
    boostFillEl.style.background =
      bp <= 20 ? "rgba(255,160,160,0.95)" : "rgba(120,220,255,0.95)";
  }

  boostTextEl.textContent = boostLocked
    ? `${boost.toFixed(1)}s (LOCKED)`
    : `${boost.toFixed(1)}s`;
}

restart();
updateHUD();
requestAnimationFrame(animate);