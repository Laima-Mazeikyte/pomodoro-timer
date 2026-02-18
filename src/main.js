// Pomodoro Timer – config (easily changeable for production)
const WORK_DURATION_SEC = 1500;   // 1 min for testing
const BREAK_DURATION_SEC = 300; // 1 min for testing

// State
let timeRemaining = WORK_DURATION_SEC; // seconds
let isRunning = false;
let currentMode = 'work'; // 'work' | 'break'
let intervalId = null;

// DOM
const app = document.getElementById('app');
const modeIndicator = document.getElementById('mode-indicator');
const timeDisplay = document.getElementById('time-display');
const startPauseBtn = document.getElementById('start-pause-btn');
const resetBtn = document.getElementById('reset-btn');

/** Set visual theme from current mode. Call when switching work, break, or paused. */
export function setMode(mode) {
  if (mode === 'work' || mode === 'break' || mode === 'paused') {
    app.dataset.mode = mode;
  }
}

/** Format seconds as MM:SS. */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Update mode label for screen readers and display. */
function getModeLabel(mode) {
  return mode === 'work' ? 'Focus' : 'Break';
}

/** Refresh all timer UI from state. */
function updateDOM() {
  timeDisplay.textContent = formatTime(timeRemaining);
  const displayMode = isRunning ? currentMode : 'paused';
  setMode(displayMode);
  modeIndicator.textContent = getModeLabel(currentMode);
  startPauseBtn.textContent = isRunning ? 'Pause' : 'Start';
  startPauseBtn.setAttribute('aria-label', isRunning ? 'Pause timer' : 'Start timer');
}

/** Start the next phase (work or break) with correct duration. */
function startPhase(mode) {
  currentMode = mode;
  timeRemaining = mode === 'work' ? WORK_DURATION_SEC : BREAK_DURATION_SEC;
  updateDOM();
}

/** Called every second when timer is running. */
function tick() {
  if (timeRemaining <= 0) {
    // Auto-switch: work -> break, break -> work
    startPhase(currentMode === 'work' ? 'break' : 'work');
    return;
  }
  timeRemaining -= 1;
  updateDOM();
}

/** Start or pause the countdown. */
function toggleStartPause() {
  isRunning = !isRunning;
  if (isRunning) {
    intervalId = setInterval(tick, 1000);
  } else {
    clearInterval(intervalId);
    intervalId = null;
    setMode('paused');
  }
  updateDOM();
}

/** Stop timer and reset to work mode with full work duration. */
function reset() {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  startPhase('work');
}

// Event listeners
startPauseBtn.addEventListener('click', toggleStartPause);
resetBtn.addEventListener('click', reset);

// Initial state: work mode, full duration, not running
startPhase('work');
