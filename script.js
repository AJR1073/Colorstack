"use strict";

const AUTO_DELAY = 360;

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

const settings = {
  capacity: 5,
  colorCount: 6,
  extraTowers: 1,
  difficulty: "normal"
};

const boardEl = document.querySelector("#board");
const moveCountEl = document.querySelector("#move-count");
const statusEl = document.querySelector("#solver-status");
const newButton = document.querySelector("#new-game");
const undoButton = document.querySelector("#undo");
const hintButton = document.querySelector("#hint");
const autoplayButton = document.querySelector("#autoplay");
const capacitySelect = document.querySelector("#capacity-select");
const colorCountSelect = document.querySelector("#color-count-select");
const extraTowersSelect = document.querySelector("#extra-towers-select");
const difficultySelect = document.querySelector("#difficulty-select");

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

function towerCount() {
  return settings.colorCount + settings.extraTowers;
}

function settingsKey() {
  return `${settings.capacity}:${settings.colorCount}:${settings.extraTowers}:${settings.difficulty}`;
}

function currentDifficulty() {
  return DIFFICULTIES[settings.difficulty] || DIFFICULTIES.normal;
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
  settings.capacity = Number(capacitySelect.value);
  settings.colorCount = Number(colorCountSelect.value);
  settings.extraTowers = Number(extraTowersSelect.value);
  settings.difficulty = difficultySelect.value;
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

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
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

function makeFallbackPuzzle() {
  let state = makeSolvedState();
  const scramblePath = [];
  let lastMove = null;

  for (let step = 0; step < Math.max(12, settings.colorCount * 2); step += 1) {
    const moves = getReverseScrambleMoves(state, lastMove);
    if (!moves.length) break;
    const move = randomChoice(moves);
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

  for (let attempt = 0; attempt < currentDifficulty().attempts; attempt += 1) {
    let state = makeSolvedState();
    let lastMove = null;
    const scramblePath = [];

    for (let step = 0; step < getScrambleMoves(); step += 1) {
      const moves = getReverseScrambleMoves(state, lastMove);
      if (!moves.length) break;
      const move = randomChoice(moves);
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

  return bestPuzzle || makeFallbackPuzzle();
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

function applyMove(from, to, options = {}) {
  if (!canMove(towers, from, to)) return false;

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

  if (isSolvedState(towers)) {
    stopAutoplay("Solved");
    setStatus(`Solved in ${moveCount}`);
  } else if (!options.silent) {
    setStatus("Ready");
  }

  renderBoard();
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
  if (towers[index].length) {
    selectedTower = index;
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
  setStatus(`${color}: ${hintMove.from + 1} to ${hintMove.to + 1}`);
  renderBoard();
}

function stopAutoplay(message) {
  if (autoplayTimer) {
    window.clearTimeout(autoplayTimer);
    autoplayTimer = null;
  }
  isAutoplaying = false;
  autoplayButton.classList.remove("is-running");
  autoplayButton.textContent = "Auto";
  if (message) setStatus(message);
  renderBoard();
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
  clearHint();
  clearSolutionCache();
  setStatus("Ready");
  renderBoard();
}

function newGame() {
  stopAutoplay();
  syncSettingsFromControls();
  const puzzle = makePuzzle();
  towers = puzzle.state;
  initialSolution = puzzle.solution;
  selectedTower = null;
  moveCount = 0;
  history = [];
  moveLog = [];
  clearHint();
  clearSolutionCache();
  cachedSolution = { key: solutionCacheKey(towers), path: initialSolution.slice() };
  setStatus("Ready");
  renderBoard();
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
capacitySelect.addEventListener("change", newGame);
colorCountSelect.addEventListener("change", newGame);
extraTowersSelect.addEventListener("change", newGame);
difficultySelect.addEventListener("change", newGame);

syncSettingsFromControls();
newGame();
