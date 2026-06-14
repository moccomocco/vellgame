const NOTES = [
  { name: "ド", key: "1", frequency: 261.63, color: "#e85d75" },
  { name: "レ", key: "2", frequency: 293.66, color: "#f2a541" },
  { name: "ミ", key: "3", frequency: 329.63, color: "#f0c84b" },
  { name: "ファ", key: "4", frequency: 349.23, color: "#56b870" },
  { name: "ソ", key: "5", frequency: 392.0, color: "#0f8b8d" },
  { name: "ラ", key: "6", frequency: 440.0, color: "#4c7bd9" },
  { name: "シ", key: "7", frequency: 493.88, color: "#8b5fd3" },
];

const BEST_SCORE_KEY = "bell-memory-solo-best";
const CONFETTI_COLORS = ["#f0c84b", "#e85d75", "#56b870", "#4c7bd9", "#8b5fd3", "#fff0a6"];

const bellBoard = document.getElementById("bellBoard");
const sequenceTrack = document.getElementById("sequenceTrack");
const cpuModeButton = document.getElementById("cpuModeButton");
const soloModeButton = document.getElementById("soloModeButton");
const duoModeButton = document.getElementById("duoModeButton");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");
const againButton = document.getElementById("againButton");
const lengthLabel = document.getElementById("lengthLabel");
const bestLabel = document.getElementById("bestLabel");
const turnLabel = document.getElementById("turnLabel");
const progressLabel = document.getElementById("progressLabel");
const statusKicker = document.getElementById("statusKicker");
const statusTitle = document.getElementById("statusTitle");
const statusDetail = document.getElementById("statusDetail");
const resultPanel = document.getElementById("resultPanel");
const resultKicker = document.getElementById("resultKicker");
const resultTitle = document.getElementById("resultTitle");
const resultDetail = document.getElementById("resultDetail");
const confettiLayer = document.getElementById("confettiLayer");

let audioContext;
let state = createInitialState("cpu");

function createInitialState(mode) {
  return {
    mode,
    started: false,
    status: "idle",
    sequence: [],
    currentPlayer: 1,
    inputIndex: 0,
    runBest: 0,
    inputLocked: false,
    replayCursor: -1,
    message: {
      kicker: "READY",
      title: "スタート",
      detail: readyDetail(mode),
    },
    result: null,
  };
}

function readyDetail(mode) {
  if (mode === "solo") return "ひとりで限界まで記録を伸ばします。";
  if (mode === "duo") return "プレイヤー1から始めます。";
  return "CPU戦を開始できます。";
}

function renderBellBoard() {
  bellBoard.innerHTML = "";
  NOTES.forEach((note, index) => {
    const button = document.createElement("button");
    button.className = "bell-button";
    button.type = "button";
    button.dataset.note = String(index);
    button.style.setProperty("--bell-color", note.color);
    button.setAttribute("aria-label", `${note.name}のベル`);
    button.innerHTML = `
      <span class="bell-visual" aria-hidden="true"><span class="bell-clapper"></span></span>
      <span class="note-name">${note.name}</span>
    `;
    button.addEventListener("click", () => handleBellPress(index));
    bellBoard.appendChild(button);
  });
}

function render() {
  lengthLabel.textContent = String(state.sequence.length);
  bestLabel.textContent = String(getBestScore());
  turnLabel.textContent = turnText();
  progressLabel.textContent = progressText();
  statusKicker.textContent = state.message.kicker;
  statusTitle.textContent = state.message.title;
  statusDetail.textContent = state.message.detail;

  cpuModeButton.classList.toggle("is-active", state.mode === "cpu");
  soloModeButton.classList.toggle("is-active", state.mode === "solo");
  duoModeButton.classList.toggle("is-active", state.mode === "duo");
  startButton.disabled = state.started && state.status !== "finished";
  startButton.textContent = state.status === "finished" ? "もう一度" : "スタート";

  const inputOpen = isHumanInputOpen();
  document.querySelectorAll(".bell-button").forEach((button) => {
    button.disabled = !inputOpen;
  });

  renderSequenceTrack();

  if (state.result) {
    resultKicker.textContent = state.result.kicker;
    resultTitle.textContent = state.result.title;
    resultDetail.textContent = state.result.detail;
    resultPanel.classList.remove("hidden");
  } else {
    resultPanel.classList.add("hidden");
  }
}

function renderSequenceTrack() {
  sequenceTrack.innerHTML = "";
  const visibleCount = Math.min(Math.max(state.sequence.length + 1, 1), 28);
  const hiddenBefore = Math.max(0, state.sequence.length + 1 - visibleCount);

  for (let i = hiddenBefore; i < hiddenBefore + visibleCount; i += 1) {
    const dot = document.createElement("span");
    dot.className = "sequence-dot";
    if (i < state.inputIndex || i <= state.replayCursor) {
      dot.classList.add("is-done");
    }
    if (state.status === "human" && i === state.sequence.length) {
      dot.classList.add("is-extra");
    }
    sequenceTrack.appendChild(dot);
  }
}

function turnText() {
  if (state.status === "finished") return "終了";
  if (!state.started) return "待機";
  if (state.mode === "cpu") {
    return state.status === "cpu" ? "CPU" : "あなた";
  }
  if (state.mode === "solo") return "ひとり";
  return `P${state.currentPlayer}`;
}

function progressText() {
  if (!state.started || state.status === "finished") {
    return `${state.sequence.length}/${state.sequence.length}`;
  }
  if (state.status === "cpu") return "再生中";
  if (state.inputIndex >= state.sequence.length) return "追加";
  return `${state.inputIndex}/${state.sequence.length}`;
}

function getBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function updateBestScore(score) {
  const previousBest = getBestScore();
  if (score <= previousBest) return false;

  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    return false;
  }
  return true;
}

function isHumanInputOpen() {
  return state.started && state.status === "human" && !state.inputLocked && !state.result;
}

async function ensureAudio() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    return true;
  } catch {
    return false;
  }
}

function playTone(noteIndex, duration = 0.38, volume = 0.28) {
  if (!audioContext) return;

  const note = NOTES[noteIndex];
  const now = audioContext.currentTime;
  const main = audioContext.createOscillator();
  const shine = audioContext.createOscillator();
  const mainGain = audioContext.createGain();
  const shineGain = audioContext.createGain();
  const master = audioContext.createGain();

  main.type = "sine";
  shine.type = "triangle";
  main.frequency.setValueAtTime(note.frequency, now);
  shine.frequency.setValueAtTime(note.frequency * 2.01, now);

  mainGain.gain.setValueAtTime(0.0001, now);
  mainGain.gain.exponentialRampToValueAtTime(volume, now + 0.018);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  shineGain.gain.setValueAtTime(0.0001, now);
  shineGain.gain.exponentialRampToValueAtTime(volume * 0.18, now + 0.012);
  shineGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.62);

  master.gain.setValueAtTime(0.9, now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.04);

  main.connect(mainGain);
  shine.connect(shineGain);
  mainGain.connect(master);
  shineGain.connect(master);
  master.connect(audioContext.destination);

  main.start(now);
  shine.start(now);
  main.stop(now + duration + 0.06);
  shine.stop(now + duration + 0.06);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function ringBell(noteIndex, options = {}) {
  const { miss = false, duration = 360 } = options;
  const button = bellBoard.querySelector(`[data-note="${noteIndex}"]`);
  if (!button) return;

  button.classList.add("is-ringing");
  if (miss) button.classList.add("is-miss");
  ensureAudio();
  playTone(noteIndex, duration / 1000);

  await wait(duration);
  button.classList.remove("is-ringing");
  if (miss) button.classList.remove("is-miss");
}

function setMode(mode) {
  if (state.mode === mode) return;
  state = createInitialState(mode);
  render();
}

function startGame() {
  ensureAudio();
  state = createInitialState(state.mode);
  state.started = true;

  if (state.mode === "cpu") {
    runCpuTurn();
    return;
  }

  if (state.mode === "solo") {
    beginHumanTurn(1, {
      kicker: "SOLO",
      title: "とことん",
      detail: "最初の1音を鳴らします。",
    });
    return;
  }

  beginHumanTurn(1, {
    kicker: "PLAYER 1",
    title: "プレイヤー1",
    detail: "最初の1音を鳴らします。",
  });
}

function resetGame() {
  state = createInitialState(state.mode);
  render();
}

function beginHumanTurn(player, message) {
  state.status = "human";
  state.currentPlayer = player;
  state.inputIndex = 0;
  state.inputLocked = false;
  state.replayCursor = -1;
  state.message =
    message ||
    humanTurnMessage(player, state.sequence.length === 0 ? "first" : "replay");
  render();
}

function humanTurnMessage(player, phase) {
  if (state.mode === "solo") {
    return {
      kicker: "SOLO",
      title:
        phase === "first"
          ? "とことん"
          : phase === "add"
            ? "1音追加"
            : "なぞる",
      detail:
        phase === "first"
          ? "最初の1音を鳴らします。"
          : phase === "add"
            ? "好きなベルを1つ足します。"
            : `暗記チェック中です。 ${state.inputIndex}/${state.sequence.length}`,
    };
  }

  if (state.mode === "cpu") {
    return {
      kicker: "YOUR TURN",
      title: phase === "add" ? "1音追加" : "なぞる",
      detail:
        phase === "add"
          ? "好きなベルを鳴らします。"
          : `列をなぞっています。 ${state.inputIndex}/${state.sequence.length}`,
    };
  }

  return {
    kicker: `PLAYER ${player}`,
    title:
      phase === "first"
        ? `プレイヤー${player}`
        : phase === "add"
          ? "1音追加"
          : "なぞる",
    detail:
      phase === "first"
        ? "最初の1音を鳴らします。"
        : phase === "add"
          ? `プレイヤー${player}が1音追加します。`
          : `プレイヤー${player}: ${state.inputIndex}/${state.sequence.length}`,
  };
}

async function handleBellPress(noteIndex) {
  if (!isHumanInputOpen()) return;

  state.inputLocked = true;

  if (state.inputIndex < state.sequence.length) {
    const expected = state.sequence[state.inputIndex];
    if (noteIndex !== expected) {
      await ringBell(noteIndex, { miss: true, duration: 260 });
      state.inputLocked = false;
      handleMistake(expected);
      return;
    }

    await ringBell(noteIndex, { duration: 230 });
    state.inputIndex += 1;
    const completedSequence = state.inputIndex >= state.sequence.length;

    state.message = humanTurnMessage(state.currentPlayer, "replay");
    if (completedSequence) {
      if (state.mode === "solo" && state.sequence.length > 0) {
        state.runBest = Math.max(state.runBest, state.sequence.length);
      }

      state.message = humanTurnMessage(state.currentPlayer, "add");
    }
    state.inputLocked = false;
    render();
    return;
  }

  await ringBell(noteIndex, { duration: 230 });
  state.sequence.push(noteIndex);
  state.inputLocked = false;
  render();
  await wait(220);

  if (state.mode === "solo") {
    beginHumanTurn(1);
    return;
  }

  if (state.mode === "cpu") {
    await runCpuTurn();
    return;
  }

  const nextPlayer = state.currentPlayer === 1 ? 2 : 1;
  beginHumanTurn(nextPlayer);
}

function handleMistake(expected) {
  const expectedName = NOTES[expected].name;

  if (state.mode === "solo") {
    const previousBest = getBestScore();
    const isNewRecord = state.runBest > previousBest;
    if (isNewRecord) {
      updateBestScore(state.runBest);
    }

    finishGame({
      kicker: isNewRecord ? "NEW RECORD" : "RESULT",
      title: `今回 ${state.runBest}個`,
      detail: isNewRecord
        ? `正解は「${expectedName}」でした。最高記録を ${state.runBest}個 に更新しました。`
        : `正解は「${expectedName}」でした。最高記録は ${previousBest}個 です。`,
    });
    if (isNewRecord) launchConfetti();
    return;
  }

  if (state.mode === "cpu") {
    finishGame({
      kicker: "GAME OVER",
      title: "CPUの勝ち",
      detail: `正解は「${expectedName}」でした。長さ ${state.sequence.length} まで到達しました。`,
    });
    return;
  }

  const winner = state.currentPlayer === 1 ? 2 : 1;
  finishGame({
    kicker: "RESULT",
    title: `プレイヤー${winner}の勝ち`,
    detail: `正解は「${expectedName}」でした。長さ ${state.sequence.length} で決着です。`,
  });
}

async function runCpuTurn() {
  state.status = "cpu";
  state.inputLocked = true;
  state.replayCursor = -1;
  state.message = {
    kicker: "CPU TURN",
    title: state.sequence.length === 0 ? "CPUが開始" : "CPUがなぞる",
    detail: state.sequence.length === 0 ? "最初の1音を作ります。" : "CPUが列を確認しています。",
  };
  render();
  await wait(520);

  if (state.sequence.length > 0) {
    const failIndex = chooseCpuFailIndex();
    for (let i = 0; i < state.sequence.length; i += 1) {
      state.replayCursor = i;
      render();

      const correctNote = state.sequence[i];
      const noteToPlay = i === failIndex ? chooseWrongNote(correctNote) : correctNote;
      await ringBell(noteToPlay, {
        duration: 380,
        miss: i === failIndex,
      });
      await wait(130);

      if (i === failIndex) {
        finishGame({
          kicker: "WIN",
          title: "あなたの勝ち",
          detail: `CPUが「${NOTES[correctNote].name}」を外しました。長さ ${state.sequence.length} で勝利です。`,
        });
        return;
      }
    }
  }

  state.replayCursor = -1;
  const addedNote = randomNote();
  state.sequence.push(addedNote);
  state.message = {
    kicker: "CPU TURN",
    title: "CPUが1音追加",
    detail: `長さ ${state.sequence.length} になりました。`,
  };
  render();
  await wait(260);
  await ringBell(addedNote, { duration: 440 });
  await wait(360);

  beginHumanTurn(1);
}

function chooseCpuFailIndex() {
  if (state.sequence.length < 6) return -1;
  const failChance = Math.min(0.08 + (state.sequence.length - 6) * 0.035, 0.34);
  return Math.random() < failChance
    ? Math.floor(Math.random() * state.sequence.length)
    : -1;
}

function chooseWrongNote(expected) {
  let note = randomNote();
  while (note === expected) {
    note = randomNote();
  }
  return note;
}

function randomNote() {
  return Math.floor(Math.random() * NOTES.length);
}

function launchConfetti() {
  if (!confettiLayer) return;

  confettiLayer.innerHTML = "";
  const total = 90;

  for (let i = 0; i < total; i += 1) {
    const piece = document.createElement("span");
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const x = Math.random() * 100;
    const dx = (Math.random() - 0.5) * 520;
    const spin = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720);
    const duration = 1050 + Math.random() * 800;
    const delay = Math.random() * 180;
    const width = 6 + Math.random() * 8;
    const height = 8 + Math.random() * 12;

    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${x}%`);
    piece.style.setProperty("--dx", `${dx}px`);
    piece.style.setProperty("--spin", `${spin}deg`);
    piece.style.setProperty("--duration", `${duration}ms`);
    piece.style.setProperty("--delay", `${delay}ms`);
    piece.style.setProperty("--w", `${width}px`);
    piece.style.setProperty("--h", `${height}px`);
    piece.style.setProperty("--color", color);
    confettiLayer.appendChild(piece);
  }

  window.setTimeout(() => {
    confettiLayer.innerHTML = "";
  }, 2200);
}

function finishGame(result) {
  state.status = "finished";
  state.started = true;
  state.inputLocked = true;
  state.result = result;
  state.message = {
    kicker: result.kicker,
    title: result.title,
    detail: result.detail,
  };
  render();
}

cpuModeButton.addEventListener("click", () => setMode("cpu"));
soloModeButton.addEventListener("click", () => setMode("solo"));
duoModeButton.addEventListener("click", () => setMode("duo"));
startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", resetGame);
againButton.addEventListener("click", startGame);

window.addEventListener("keydown", (event) => {
  const noteIndex = NOTES.findIndex((note) => note.key === event.key);
  if (noteIndex >= 0) {
    event.preventDefault();
    handleBellPress(noteIndex);
  }
  if (event.key.toLowerCase() === "r") {
    resetGame();
  }
});

renderBellBoard();
render();
