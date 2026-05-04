"use strict";

const AUTO_DELAY = 360;
const STORAGE_PREFIX = "colorstack.";
// Add a slot ID here after creating a display ad unit in Google AdSense.
const ADSENSE_CONFIG = {
  client: "ca-pub-5616650637352559",
  slot: ""
};

const COLORS = [
  { name: "purple", hex: "#a653bf" },
  { name: "blue", hex: "#238bc0" },
  { name: "green", hex: "#68c735" },
  { name: "red", hex: "#e34d50" },
  { name: "yellow", hex: "#e6d829" },
  { name: "orange", hex: "#f28a2e" },
  { name: "teal", hex: "#20b6a5" },
  { name: "pink", hex: "#eb5fa6" }
];

const DIFFICULTIES = {
  easy: {
    scrambleMultiplier: 0.38,
    breakRatio: 0.16,
    scoreRatio: 0.7,
    minScrambleMoves: 12,
    maxScrambleMoves: 34,
    attempts: 35
  },
  normal: {
    scrambleMultiplier: 1,
    breakRatio: 0.32,
    scoreRatio: 1.35,
    minScrambleMoves: 22,
    maxScrambleMoves: 76,
    attempts: 80
  },
  hard: {
    scrambleMultiplier: 1.38,
    breakRatio: 0.42,
    scoreRatio: 1.72,
    minScrambleMoves: 34,
    maxScrambleMoves: 110,
    attempts: 110
  },
  expert: {
    scrambleMultiplier: 1.78,
    breakRatio: 0.5,
    scoreRatio: 2.05,
    minScrambleMoves: 44,
    maxScrambleMoves: 140,
    attempts: 140
  }
};

const LEVELS = {
  level1: {
    capacity: 4,
    colorCount: 4,
    extraTowers: 2,
    difficulty: "easy",
    seed: 1187
  },
  level2: {
    capacity: 4,
    colorCount: 5,
    extraTowers: 1,
    difficulty: "normal",
    seed: 2701
  },
  level3: {
    capacity: 5,
    colorCount: 6,
    extraTowers: 1,
    difficulty: "normal",
    seed: 4903
  },
  level4: {
    capacity: 5,
    colorCount: 7,
    extraTowers: 1,
    difficulty: "hard",
    seed: 8123
  },
  level5: {
    capacity: 6,
    colorCount: 8,
    extraTowers: 1,
    difficulty: "expert",
    seed: 14281
  }
};

const settings = {
  level: "random",
  capacity: 5,
  colorCount: 6,
  extraTowers: 1,
  difficulty: "normal"
};

const boardEl = document.querySelector("#board");
const rewardLayerEl = document.querySelector("#reward-layer");
const moveCountEl = document.querySelector("#move-count");
const bestScoreEl = document.querySelector("#best-score");
const playCountEl = document.querySelector("#play-count");
const statusEl = document.querySelector("#solver-status");
const newButton = document.querySelector("#new-game");
const undoButton = document.querySelector("#undo");
const hintButton = document.querySelector("#hint");
const autoplayButton = document.querySelector("#autoplay");
const soundToggleButton = document.querySelector("#sound-toggle");
const levelSelect = document.querySelector("#level-select");
const capacitySelect = document.querySelector("#capacity-select");
const colorCountSelect = document.querySelector("#color-count-select");
const extraTowersSelect = document.querySelector("#extra-towers-select");
const difficultySelect = document.querySelector("#difficulty-select");
const winPanelEl = document.querySelector("#win-panel");
const winSummaryEl = document.querySelector("#win-summary");
const winNewGameButton = document.querySelector("#win-new-game");
const winHarderButton = document.querySelector("#win-harder");
const adPanelEl = document.querySelector(".ad-panel");
const adsenseSlotEl = document.querySelector("#adsense-slot");

let towers = [];
let selectedTower = null;
let moveCount = 0;
let history = [];
let moveLog = [];
let initialSolution = [];
let hintMove = null;
let invalidTower = null;
let cachedSolution = null;
let autoplayTimer = null;
let isAutoplaying = false;
let usedAutoplay = false;
let celebrationTimer = null;
let celebrationRunning = false;
let celebrationDismissReady = false;
let audioContext = null;
let isMuted = readStoredValue("muted") === "true";

function towerCount() {
  return settings.colorCount + settings.extraTowers;
}

function settingsKey() {
  if (settings.level !== "random") {
    return `level:${settings.level}`;
  }
  return `random:${settings.capacity}:${settings.colorCount}:${settings.extraTowers}:${settings.difficulty}`;
}

function currentDifficulty() {
  return DIFFICULTIES[settings.difficulty] || DIFFICULTIES.normal;
}

function getStorage() {
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function readStoredValue(key) {
  const storage = getStorage();
  if (!storage) return null;

  try {
    return storage.getItem(`${STORAGE_PREFIX}${key}`);
  } catch (error) {
    return null;
  }
}

function writeStoredValue(key, value) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(`${STORAGE_PREFIX}${key}`, value);
  } catch (error) {}
}

function getPlayCount() {
  const stored = Number(readStoredValue("playCount"));
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

function updatePlayCountDisplay() {
  playCountEl.textContent = String(getPlayCount());
}

function incrementPlayCount() {
  const nextCount = getPlayCount() + 1;
  writeStoredValue("playCount", String(nextCount));
  playCountEl.textContent = String(nextCount);
}

function hasAdSenseConfig() {
  return ADSENSE_CONFIG.client.startsWith("ca-pub-") && ADSENSE_CONFIG.slot.length > 0;
}

function setupAdSense() {
  if (!adsenseSlotEl || !adPanelEl || !hasAdSenseConfig()) return;

  adPanelEl.classList.remove("is-placeholder");
  adsenseSlotEl.dataset.adClient = ADSENSE_CONFIG.client;
  adsenseSlotEl.dataset.adSlot = ADSENSE_CONFIG.slot;

  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CONFIG.client)}`;
  document.head.append(script);

  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.push({});
}

function makeSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function getScrambleMoves() {
  const blockCount = settings.capacity * settings.colorCount;
  const emptyPoleBoost = settings.extraTowers * 6;
  const baseMoves = blockCount + emptyPoleBoost + 16;
  const difficulty = currentDifficulty();
  return Math.min(
    difficulty.maxScrambleMoves,
    Math.max(difficulty.minScrambleMoves, Math.round(baseMoves * difficulty.scrambleMultiplier))
  );
}

function getMinBreaks() {
  return Math.max(5, Math.floor(settings.capacity * settings.colorCount * currentDifficulty().breakRatio));
}

function getMinDifficultyScore() {
  return Math.floor(settings.capacity * settings.colorCount * currentDifficulty().scoreRatio);
}

function syncSettingsFromControls() {
  settings.level = levelSelect.value;

  if (settings.level !== "random" && LEVELS[settings.level]) {
    const level = LEVELS[settings.level];
    settings.capacity = level.capacity;
    settings.colorCount = level.colorCount;
    settings.extraTowers = level.extraTowers;
    settings.difficulty = level.difficulty;
    syncControlsFromSettings();
    return;
  }

  settings.level = "random";
  settings.capacity = Number(capacitySelect.value);
  settings.colorCount = Number(colorCountSelect.value);
  settings.extraTowers = Number(extraTowersSelect.value);
  settings.difficulty = difficultySelect.value;
}

function syncControlsFromSettings() {
  levelSelect.value = settings.level;
  capacitySelect.value = String(settings.capacity);
  colorCountSelect.value = String(settings.colorCount);
  extraTowersSelect.value = String(settings.extraTowers);
  difficultySelect.value = settings.difficulty;
}

function setRandomModeFromControls() {
  levelSelect.value = "random";
  syncSettingsFromControls();
}

function cloneState(state) {
  return state.map((tower) => tower.slice());
}

function makeSolvedState() {
  const state = [];
  for (let color = 0; color < settings.colorCount; color += 1) {
    state.push(Array(settings.capacity).fill(color));
  }
  while (state.length < towerCount()) {
    state.push([]);
  }
  return state;
}

function topColor(tower) {
  return tower.length ? tower[tower.length - 1] : null;
}

function isUniform(tower) {
  return tower.every((color) => color === tower[0]);
}

function isSolvedState(state) {
  return state.every((tower) => {
    if (tower.length === 0) return true;
    return tower.length === settings.capacity && isUniform(tower);
  });
}

function canMove(state, from, to) {
  if (from === to) return false;
  const source = state[from];
  const target = state[to];
  if (!source.length || target.length >= settings.capacity) return false;
  return !target.length || topColor(target) === topColor(source);
}

function moveBlock(state, from, to) {
  const next = cloneState(state);
  next[to].push(next[from].pop());
  return next;
}

function reverseCanMove(state, from, to) {
  if (from === to) return false;
  const source = state[from];
  const target = state[to];
  if (!source.length || target.length >= settings.capacity) return false;

  const color = topColor(source);
  const sourceAfter = source.slice(0, -1);
  return sourceAfter.length === 0 || topColor(sourceAfter) === color;
}

function randomChoice(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

function getReverseScrambleMoves(state, lastMove) {
  const moves = [];
  for (let from = 0; from < state.length; from += 1) {
    for (let to = 0; to < state.length; to += 1) {
      if (lastMove && lastMove.from === to && lastMove.to === from) continue;
      if (reverseCanMove(state, from, to)) {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

function colorBreaks(state) {
  let breaks = 0;
  for (const tower of state) {
    for (let i = 1; i < tower.length; i += 1) {
      if (tower[i] !== tower[i - 1]) breaks += 1;
    }
  }
  return breaks;
}

function mixedTowerCount(state) {
  return state.filter((tower) => tower.length > 1 && !isUniform(tower)).length;
}

function puzzleDifficultyScore(state, solutionLength) {
  let buriedColorChanges = 0;

  for (const tower of state) {
    const colors = new Set(tower);
    buriedColorChanges += Math.max(0, colors.size - 1);
  }

  return (
    colorBreaks(state) * 3 +
    mixedTowerCount(state) * 4 +
    buriedColorChanges * 2 +
    Math.min(solutionLength, 90) * 0.12
  );
}

function reverseScramblePath(scramblePath) {
  return scramblePath
    .slice()
    .reverse()
    .map((move) => ({ from: move.to, to: move.from }));
}

function makeFallbackPuzzle(rng = Math.random) {
  let state = makeSolvedState();
  const scramblePath = [];
  let lastMove = null;

  for (let step = 0; step < Math.max(12, settings.colorCount * 2); step += 1) {
    const moves = getReverseScrambleMoves(state, lastMove);
    if (!moves.length) break;
    const move = randomChoice(moves, rng);
    state = moveBlock(state, move.from, move.to);
    scramblePath.push(move);
    lastMove = move;
  }

  return {
    state,
    solution: reverseScramblePath(scramblePath)
  };
}

function makePuzzle() {
  let bestPuzzle = null;
  let bestScore = -Infinity;
  const level = LEVELS[settings.level];
  const rng = level ? makeSeededRandom(level.seed) : Math.random;

  for (let attempt = 0; attempt < currentDifficulty().attempts; attempt += 1) {
    let state = makeSolvedState();
    let lastMove = null;
    const scramblePath = [];

    for (let step = 0; step < getScrambleMoves(); step += 1) {
      const moves = getReverseScrambleMoves(state, lastMove);
      if (!moves.length) break;
      const move = randomChoice(moves, rng);
      state = moveBlock(state, move.from, move.to);
      scramblePath.push(move);
      lastMove = move;
    }

    if (isSolvedState(state)) {
      continue;
    }

    const solution = reverseScramblePath(scramblePath);
    const score = puzzleDifficultyScore(state, solution.length);

    if (score > bestScore) {
      bestScore = score;
      bestPuzzle = { state, solution };
    }

    if (
      colorBreaks(state) >= getMinBreaks() &&
      score >= getMinDifficultyScore() &&
      (settings.difficulty === "easy" || settings.difficulty === "normal")
    ) {
      return { state, solution };
    }
  }

  return bestPuzzle || makeFallbackPuzzle(rng);
}

function renderBoard() {
  boardEl.style.setProperty("--capacity", String(settings.capacity));
  boardEl.style.setProperty("--tower-count", String(towers.length));
  boardEl.innerHTML = "";
  boardEl.classList.toggle("is-won", isSolvedState(towers));
  boardEl.classList.toggle("is-single-row", towers.length <= 5);

  towers.forEach((tower, towerIndex) => {
    const towerButton = document.createElement("button");
    towerButton.type = "button";
    towerButton.className = "tower";
    towerButton.dataset.index = String(towerIndex);
    towerButton.setAttribute("aria-label", `Pole ${towerIndex + 1}`);

    if (selectedTower === towerIndex) {
      towerButton.classList.add("selected");
    }
    if (hintMove && hintMove.from === towerIndex) {
      towerButton.classList.add("hint-source");
    }
    if (hintMove && hintMove.to === towerIndex) {
      towerButton.classList.add("hint-target");
    }
    if (invalidTower === towerIndex) {
      towerButton.classList.add("invalid");
    }
    if (selectedTower !== null && canMove(towers, selectedTower, towerIndex)) {
      towerButton.classList.add("legal-target");
    }

    const stack = document.createElement("div");
    stack.className = "stack";

    tower.forEach((colorIndex) => {
      const block = document.createElement("div");
      block.className = "block";
      block.style.setProperty("--block-color", COLORS[colorIndex].hex);
      block.setAttribute("aria-hidden", "true");
      stack.append(block);
    });

    towerButton.append(stack);
    towerButton.addEventListener("click", () => handleTowerClick(towerIndex));
    boardEl.append(towerButton);
  });

  moveCountEl.textContent = String(moveCount);
  updateBestScoreDisplay();
  updatePlayCountDisplay();
  undoButton.disabled = history.length === 0 || isAutoplaying;
  hintButton.disabled = isSolvedState(towers) || isAutoplaying;
  autoplayButton.disabled = isSolvedState(towers);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function clearHint() {
  hintMove = null;
  invalidTower = null;
}

function clearSolutionCache() {
  cachedSolution = null;
}

function solutionCacheKey(state) {
  return `${settingsKey()}::${stateKey(state)}`;
}

function bestScoreKey() {
  return `best.${settingsKey()}`;
}

function getBestScore() {
  const stored = readStoredValue(bestScoreKey());
  const score = Number(stored);
  return Number.isFinite(score) && score > 0 ? score : null;
}

function updateBestScoreDisplay() {
  const best = getBestScore();
  bestScoreEl.textContent = best ? String(best) : "-";
}

function recordBestScore() {
  const previousBest = getBestScore();

  if (usedAutoplay) {
    return { best: previousBest, isNewRecord: false, skipped: true };
  }

  if (!previousBest || moveCount < previousBest) {
    writeStoredValue(bestScoreKey(), String(moveCount));
    updateBestScoreDisplay();
    return { best: moveCount, isNewRecord: true, skipped: false };
  }

  return { best: previousBest, isNewRecord: false, skipped: false };
}

function hideWinPanel() {
  winPanelEl.hidden = true;
}

function showWinPanel(result) {
  const summaryParts = [`Solved in ${moveCount} moves.`];

  if (result.skipped) {
    summaryParts.push("Auto play does not update best score.");
  } else if (result.isNewRecord) {
    summaryParts.push("New best score.");
  } else if (result.best) {
    summaryParts.push(`Best score: ${result.best}.`);
  }

  winSummaryEl.textContent = summaryParts.join(" ");
  winPanelEl.hidden = false;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function setRewardVars(element, vars) {
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }
}

function updateSoundButton() {
  soundToggleButton.textContent = isMuted ? "Sound Off" : "Sound On";
  soundToggleButton.setAttribute("aria-pressed", String(!isMuted));
}

function getAudioContext() {
  if (isMuted) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone(frequency, startOffset, duration, volume = 0.08, type = "sine") {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + startOffset;
  const end = start + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function playSound(name) {
  if (isMuted) return;

  if (name === "pick") {
    playTone(360, 0, 0.06, 0.035, "triangle");
  } else if (name === "place") {
    playTone(520, 0, 0.07, 0.045, "sine");
    playTone(660, 0.035, 0.05, 0.025, "triangle");
  } else if (name === "blocked") {
    playTone(150, 0, 0.11, 0.05, "sawtooth");
  } else if (name === "hint") {
    playTone(470, 0, 0.06, 0.035, "triangle");
    playTone(720, 0.065, 0.06, 0.03, "triangle");
  } else if (name === "win") {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      playTone(frequency, index * 0.08, 0.13, 0.055, "triangle");
    });
  }
}

function toggleSound() {
  isMuted = !isMuted;
  writeStoredValue("muted", String(isMuted));
  updateSoundButton();
  if (!isMuted) {
    playSound("hint");
  }
}

function clearCelebration() {
  if (celebrationTimer) {
    window.clearTimeout(celebrationTimer);
    celebrationTimer = null;
  }
  document.removeEventListener("click", dismissCelebration, true);
  celebrationRunning = false;
  celebrationDismissReady = false;
  if (rewardLayerEl) {
    rewardLayerEl.classList.remove("is-active");
    rewardLayerEl.innerHTML = "";
  }
}

function dismissCelebration(event) {
  if (!celebrationRunning || !celebrationDismissReady) return;

  clearCelebration();
  if (event.target.closest(".game-area")) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function getRewardSources() {
  if (!rewardLayerEl) return [];

  const layerRect = rewardLayerEl.getBoundingClientRect();
  const blockEls = Array.from(boardEl.querySelectorAll(".block"));
  const blockSources = blockEls.map((blockEl) => {
    const rect = blockEl.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - layerRect.left,
      y: rect.top + rect.height / 2 - layerRect.top,
      color: blockEl.style.getPropertyValue("--block-color") || COLORS[0].hex
    };
  });

  if (blockSources.length) {
    return blockSources;
  }

  const boardRect = boardEl.getBoundingClientRect();
  return [{
    x: boardRect.left + boardRect.width / 2 - layerRect.left,
    y: boardRect.bottom - 72 - layerRect.top,
    color: COLORS[0].hex
  }];
}

function launchCelebrationWave() {
  if (!rewardLayerEl || !celebrationRunning) return;

  const sources = getRewardSources();
  if (!sources.length) return;

  if (celebrationTimer) {
    window.clearTimeout(celebrationTimer);
  }
  rewardLayerEl.classList.remove("is-active");
  rewardLayerEl.innerHTML = "";
  void rewardLayerEl.offsetWidth;
  rewardLayerEl.classList.add("is-active");

  const layerRect = rewardLayerEl.getBoundingClientRect();
  const fountainCenter = layerRect.width / 2;
  const blockCount = Math.min(72, Math.max(36, sources.length * 2));
  const sparkCount = Math.min(110, Math.max(58, sources.length * 3));

  for (let i = 0; i < blockCount; i += 1) {
    const source = sources[i % sources.length];
    const direction = source.x < fountainCenter ? -1 : 1;
    const spread = randomBetween(90, Math.min(430, layerRect.width * 0.48));
    const midX = direction * spread + randomBetween(-95, 95);
    const midY = -randomBetween(180, Math.min(520, layerRect.height * 0.78));
    const endX = midX + randomBetween(-130, 130);
    const endY = randomBetween(80, Math.min(330, layerRect.height * 0.45));
    const spin = randomBetween(-720, 720);
    const rewardBlock = document.createElement("div");

    rewardBlock.className = "reward-block";
    setRewardVars(rewardBlock, {
      "--start-x": `${source.x}px`,
      "--start-y": `${source.y}px`,
      "--mid-x": `${midX}px`,
      "--mid-y": `${midY}px`,
      "--end-x": `${endX}px`,
      "--end-y": `${endY}px`,
      "--mid-spin": `${spin * 0.45}deg`,
      "--end-spin": `${spin}deg`,
      "--duration": `${randomBetween(1450, 2300)}ms`,
      "--delay": `${randomBetween(0, 520)}ms`,
      "--block-color": source.color
    });
    rewardLayerEl.append(rewardBlock);
  }

  for (let i = 0; i < sparkCount; i += 1) {
    const source = sources[Math.floor(Math.random() * sources.length)];
    const angle = randomBetween(-Math.PI * 0.94, -Math.PI * 0.06);
    const distance = randomBetween(90, Math.min(470, layerRect.width * 0.56));
    const spark = document.createElement("div");

    spark.className = "reward-spark";
    setRewardVars(spark, {
      "--start-x": `${source.x}px`,
      "--start-y": `${source.y}px`,
      "--end-x": `${Math.cos(angle) * distance}px`,
      "--end-y": `${Math.sin(angle) * distance}px`,
      "--spark-size": `${randomBetween(4, 9)}px`,
      "--duration": `${randomBetween(980, 1900)}ms`,
      "--delay": `${randomBetween(60, 680)}ms`,
      "--block-color": COLORS[Math.floor(Math.random() * settings.colorCount)].hex
    });
    rewardLayerEl.append(spark);
  }

  celebrationTimer = window.setTimeout(launchCelebrationWave, 3100);
}

function launchCelebration() {
  if (!rewardLayerEl || celebrationRunning) return;

  celebrationRunning = true;
  celebrationDismissReady = false;
  launchCelebrationWave();

  window.setTimeout(() => {
    if (!celebrationRunning) return;
    celebrationDismissReady = true;
    document.addEventListener("click", dismissCelebration, true);
  }, 120);
}

function shouldAnimateMoves() {
  return !window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function captureMoveAnimation(from, to) {
  if (!shouldAnimateMoves()) return null;

  const sourceBlock = boardEl.querySelector(`[data-index="${from}"] .block:last-child`);
  if (!sourceBlock) return null;

  return {
    to,
    rect: sourceBlock.getBoundingClientRect(),
    color: COLORS[topColor(towers[from])].hex
  };
}

function runMoveAnimation(animation) {
  if (!animation) return;

  const targetBlock = boardEl.querySelector(`[data-index="${animation.to}"] .block:last-child`);
  if (!targetBlock) return;

  const targetRect = targetBlock.getBoundingClientRect();
  const movingBlock = document.createElement("div");
  const lift = -Math.max(44, Math.min(86, animation.rect.height * 1.4));

  targetBlock.classList.add("is-drop-ghost");
  movingBlock.className = "moving-block";
  setRewardVars(movingBlock, {
    "--start-left": `${animation.rect.left}px`,
    "--start-top": `${animation.rect.top}px`,
    "--move-width": `${animation.rect.width}px`,
    "--move-height": `${animation.rect.height}px`,
    "--move-x": `${targetRect.left - animation.rect.left}px`,
    "--move-y": `${targetRect.top - animation.rect.top}px`,
    "--lift-y": `${lift}px`,
    "--block-color": animation.color
  });
  document.body.append(movingBlock);

  const finish = () => {
    movingBlock.remove();
    targetBlock.classList.remove("is-drop-ghost");
  };

  movingBlock.addEventListener("animationend", finish, { once: true });
  window.setTimeout(finish, 460);
}

function applyMove(from, to, options = {}) {
  if (!canMove(towers, from, to)) return false;

  const moveAnimation = options.animate === false ? null : captureMoveAnimation(from, to);

  if (!options.skipHistory) {
    history.push(cloneState(towers));
  }
  if (options.trackMove !== false) {
    moveLog.push({ from, to });
  }

  towers = moveBlock(towers, from, to);
  moveCount += options.countMove === false ? 0 : 1;
  selectedTower = null;
  clearHint();
  clearSolutionCache();

  const solved = isSolvedState(towers);
  let scoreResult = null;
  if (solved) {
    scoreResult = recordBestScore();
    stopAutoplay("Solved", false);
    setStatus(`Solved in ${moveCount}`);
  } else if (!options.silent) {
    setStatus("Ready");
  }

  renderBoard();
  runMoveAnimation(moveAnimation);
  if (solved) {
    window.setTimeout(() => {
      if (!isSolvedState(towers)) return;
      playSound("win");
      showWinPanel(scoreResult);
      launchCelebration();
    }, moveAnimation ? 380 : 0);
  } else {
    playSound("place");
  }
  return true;
}

function showInvalidTower(index) {
  invalidTower = index;
  window.setTimeout(() => {
    if (invalidTower === index) {
      invalidTower = null;
      renderBoard();
    }
  }, 260);
}

function handleTowerClick(index) {
  if (isAutoplaying) return;

  if (selectedTower === null) {
    if (towers[index].length) {
      selectedTower = index;
      clearHint();
      playSound("pick");
      setStatus(`${COLORS[topColor(towers[index])].name} selected`);
      renderBoard();
    }
    return;
  }

  if (selectedTower === index) {
    selectedTower = null;
    setStatus("Ready");
    renderBoard();
    return;
  }

  if (applyMove(selectedTower, index)) {
    return;
  }

  showInvalidTower(index);
  playSound("blocked");
  if (towers[index].length) {
    selectedTower = index;
    playSound("pick");
    setStatus(`${COLORS[topColor(towers[index])].name} selected`);
  } else {
    setStatus("Blocked");
  }
  renderBoard();
}

function canonicalState(state) {
  return state
    .map((tower) => tower.join(""))
    .sort()
    .join("|");
}

function stateKey(state) {
  return state.map((tower) => tower.join("")).join("|");
}

function topRunLength(tower) {
  if (!tower.length) return 0;
  const color = topColor(tower);
  let length = 1;
  for (let i = tower.length - 2; i >= 0; i -= 1) {
    if (tower[i] !== color) break;
    length += 1;
  }
  return length;
}

function scoreMove(state, move) {
  const source = state[move.from];
  const target = state[move.to];
  const color = topColor(source);
  let score = 0;

  if (target.length && topColor(target) === color) score -= 9;
  if (target.length + 1 === settings.capacity && target.every((item) => item === color)) score -= 18;
  if (source.length > 1 && source[source.length - 2] !== color) score -= 4;
  if (!target.length) score += 8;
  if (isUniform(source)) score += 5;
  score += topRunLength(source);

  return score;
}

function getLegalMoves(state) {
  const moves = [];
  let firstEmptyTarget = -1;

  for (let from = 0; from < state.length; from += 1) {
    const source = state[from];
    if (!source.length) continue;
    if (source.length === settings.capacity && isUniform(source)) continue;

    for (let to = 0; to < state.length; to += 1) {
      if (!canMove(state, from, to)) continue;

      const target = state[to];
      if (!target.length) {
        if (isUniform(source)) continue;
        if (firstEmptyTarget !== -1 && to !== firstEmptyTarget) continue;
        firstEmptyTarget = to;
      }

      moves.push({ from, to });
    }
  }

  return moves.sort((a, b) => scoreMove(state, a) - scoreMove(state, b));
}

function heuristic(state) {
  let score = 0;

  for (const tower of state) {
    if (!tower.length) continue;
    if (tower.length === settings.capacity && isUniform(tower)) {
      score -= 8;
      continue;
    }

    const colors = new Set(tower);
    score += colors.size * 6;
    score += settings.capacity - tower.length;

    for (let i = 1; i < tower.length; i += 1) {
      if (tower[i] !== tower[i - 1]) score += 7;
    }
  }

  return score;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= this.items[index].priority) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  sinkDown(index) {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && this.items[left].priority < this.items[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.items[right].priority < this.items[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

function solvePuzzle(startState, maxNodes = 140000) {
  const startKey = canonicalState(startState);
  if (isSolvedState(startState)) return [];

  const heap = new MinHeap();
  const bestDepth = new Map([[startKey, 0]]);
  let nodes = 0;

  heap.push({
    state: cloneState(startState),
    path: [],
    cost: 0,
    priority: heuristic(startState)
  });

  while (heap.size && nodes < maxNodes) {
    const node = heap.pop();
    nodes += 1;

    if (isSolvedState(node.state)) {
      return node.path;
    }

    const moves = getLegalMoves(node.state);
    for (const move of moves) {
      const nextState = moveBlock(node.state, move.from, move.to);
      const key = canonicalState(nextState);
      const nextCost = node.cost + 1;
      const knownDepth = bestDepth.get(key);

      if (knownDepth !== undefined && knownDepth <= nextCost) {
        continue;
      }

      bestDepth.set(key, nextCost);
      heap.push({
        state: nextState,
        path: node.path.concat(move),
        cost: nextCost,
        priority: nextCost + heuristic(nextState) + scoreMove(node.state, move) * 0.1
      });
    }
  }

  return null;
}

function pathSolvesState(startState, path) {
  let state = cloneState(startState);
  for (const move of path) {
    if (!canMove(state, move.from, move.to)) {
      return false;
    }
    state = moveBlock(state, move.from, move.to);
  }
  return isSolvedState(state);
}

function getRewindSolution() {
  if (!initialSolution.length && !moveLog.length) return [];

  const rewindMoves = moveLog
    .slice()
    .reverse()
    .map((move) => ({ from: move.to, to: move.from }));

  return rewindMoves.concat(initialSolution);
}

function getSolution() {
  const key = solutionCacheKey(towers);
  if (cachedSolution && cachedSolution.key === key) {
    return cachedSolution.path;
  }

  const rewindSolution = getRewindSolution();
  if (rewindSolution.length && pathSolvesState(towers, rewindSolution)) {
    cachedSolution = { key, path: rewindSolution };
    return rewindSolution;
  }

  setStatus("Thinking");
  const path = solvePuzzle(towers);
  cachedSolution = { key, path };
  return path;
}

function showHint() {
  if (isSolvedState(towers)) return;

  const solution = getSolution();
  if (!solution || !solution.length) {
    setStatus("No hint");
    renderBoard();
    return;
  }

  hintMove = solution[0];
  const color = COLORS[topColor(towers[hintMove.from])].name;
  playSound("hint");
  setStatus(`${color}: ${hintMove.from + 1} to ${hintMove.to + 1}`);
  renderBoard();
}

function stopAutoplay(message, shouldRender = true) {
  if (autoplayTimer) {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = null;
  }
  isAutoplaying = false;
  autoplayButton.classList.remove("is-running");
  autoplayButton.textContent = "Auto";
  if (message) setStatus(message);
  if (shouldRender) {
    renderBoard();
  }
}

function autoplayStep(path) {
  if (!isAutoplaying) return;
  if (isSolvedState(towers)) {
    stopAutoplay(`Solved in ${moveCount}`);
    return;
  }

  if (!path.length) {
    const freshPath = getSolution();
    if (!freshPath || !freshPath.length) {
      stopAutoplay("No path");
      return;
    }
    path = freshPath.slice();
  }

  const move = path.shift();
  if (!move || !canMove(towers, move.from, move.to)) {
    cachedSolution = null;
    autoplayTimer = window.setTimeout(() => autoplayStep([]), AUTO_DELAY);
    return;
  }

  applyMove(move.from, move.to, { silent: true });
  if (!isAutoplaying || isSolvedState(towers)) {
    return;
  }

  cachedSolution = { key: solutionCacheKey(towers), path: path.slice() };
  setStatus("Auto playing");
  autoplayTimer = window.setTimeout(() => autoplayStep(path), AUTO_DELAY);
}

function startAutoplay() {
  if (isSolvedState(towers)) return;

  const solution = getSolution();
  if (!solution || !solution.length) {
    setStatus("No path");
    renderBoard();
    return;
  }

  selectedTower = null;
  hintMove = null;
  isAutoplaying = true;
  usedAutoplay = true;
  autoplayButton.classList.add("is-running");
  autoplayButton.textContent = "Pause";
  setStatus("Auto playing");
  renderBoard();
  autoplayTimer = window.setTimeout(() => autoplayStep(solution.slice()), 180);
}

function undoMove() {
  if (!history.length || isAutoplaying) return;
  towers = history.pop();
  moveLog.pop();
  moveCount = Math.max(0, moveCount - 1);
  selectedTower = null;
  clearCelebration();
  hideWinPanel();
  clearHint();
  clearSolutionCache();
  setStatus("Ready");
  renderBoard();
}

function newGame() {
  clearCelebration();
  hideWinPanel();
  stopAutoplay();
  syncSettingsFromControls();
  const puzzle = makePuzzle();
  towers = puzzle.state;
  initialSolution = puzzle.solution;
  selectedTower = null;
  moveCount = 0;
  history = [];
  moveLog = [];
  usedAutoplay = false;
  incrementPlayCount();
  clearHint();
  clearSolutionCache();
  cachedSolution = { key: solutionCacheKey(towers), path: initialSolution.slice() };
  setStatus("Ready");
  renderBoard();
}

function startRandomGameFromControls() {
  setRandomModeFromControls();
  newGame();
}

function startSelectedLevel() {
  syncSettingsFromControls();
  newGame();
}

function startHarderPuzzle() {
  const difficultyOrder = ["easy", "normal", "hard", "expert"];
  const currentIndex = difficultyOrder.indexOf(settings.difficulty);

  settings.level = "random";
  if (currentIndex >= 0 && currentIndex < difficultyOrder.length - 1) {
    settings.difficulty = difficultyOrder[currentIndex + 1];
  } else if (settings.colorCount < COLORS.length) {
    settings.colorCount += 1;
  } else if (settings.capacity < 6) {
    settings.capacity += 1;
  }

  syncControlsFromSettings();
  newGame();
}

newButton.addEventListener("click", newGame);
undoButton.addEventListener("click", undoMove);
hintButton.addEventListener("click", showHint);
autoplayButton.addEventListener("click", () => {
  if (isAutoplaying) {
    stopAutoplay("Paused");
  } else {
    startAutoplay();
  }
});
soundToggleButton.addEventListener("click", toggleSound);
winNewGameButton.addEventListener("click", newGame);
winHarderButton.addEventListener("click", startHarderPuzzle);
levelSelect.addEventListener("change", startSelectedLevel);
capacitySelect.addEventListener("change", startRandomGameFromControls);
colorCountSelect.addEventListener("change", startRandomGameFromControls);
extraTowersSelect.addEventListener("change", startRandomGameFromControls);
difficultySelect.addEventListener("change", startRandomGameFromControls);

syncSettingsFromControls();
updateSoundButton();
setupAdSense();
newGame();
