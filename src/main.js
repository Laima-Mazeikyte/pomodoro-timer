// Pomodoro Timer – duration config & persistence
const FOCUS_STORAGE_KEY = 'pomodoro-focus-min';
const BREAK_STORAGE_KEY = 'pomodoro-break-min';
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;
const FOCUS_MIN = 1;
const FOCUS_MAX = 90;
const BREAK_MIN = 1;
const BREAK_MAX = 30;

let workDurationSec = DEFAULT_FOCUS_MIN * 60;
let breakDurationSec = DEFAULT_BREAK_MIN * 60;

function loadDurationsFromStorage() {
  const focusMin = parseInt(localStorage.getItem(FOCUS_STORAGE_KEY), 10);
  const breakMin = parseInt(localStorage.getItem(BREAK_STORAGE_KEY), 10);
  const focus = Number.isNaN(focusMin) ? DEFAULT_FOCUS_MIN : Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, focusMin));
  const break_ = Number.isNaN(breakMin) ? DEFAULT_BREAK_MIN : Math.max(BREAK_MIN, Math.min(BREAK_MAX, breakMin));
  workDurationSec = focus * 60;
  breakDurationSec = break_ * 60;
}

function saveDurationsToStorage(focusMin, breakMin) {
  const focus = Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, Math.round(Number(focusMin)) || DEFAULT_FOCUS_MIN));
  const break_ = Math.max(BREAK_MIN, Math.min(BREAK_MAX, Math.round(Number(breakMin)) || DEFAULT_BREAK_MIN));
  localStorage.setItem(FOCUS_STORAGE_KEY, String(focus));
  localStorage.setItem(BREAK_STORAGE_KEY, String(break_));
  workDurationSec = focus * 60;
  breakDurationSec = break_ * 60;
}

// State
let timeRemaining = workDurationSec; // seconds
let isRunning = false;
let currentMode = 'work'; // 'work' | 'break'
let intervalId = null;

// DOM
const app = document.getElementById('app');
const modeIndicator = document.getElementById('mode-indicator');
const timeDisplay = document.getElementById('time-display');
const startPauseBtn = document.getElementById('start-pause-btn');
const resetBtn = document.getElementById('reset-btn');
const fullTimerView = document.getElementById('full-timer-view');
const minimizedView = document.getElementById('minimized-view');
const popoutBtn = document.getElementById('popout-btn');
const restoreBtn = document.getElementById('restore-btn');
const popupBlockedMessage = document.getElementById('popup-blocked-message');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const focusMinInput = document.getElementById('focus-min-input');
const breakMinInput = document.getElementById('break-min-input');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');

const MINI_POPUP_NAME = 'pomodoro-mini';
const MINI_POPUP_WIDTH = 220;
const MINI_POPUP_HEIGHT = 140;
let miniPopup = null;
let popupCheckIntervalId = null;

function getMiniPopupFeatures() {
  const left = localStorage.getItem('pomodoro-mini-left');
  const top = localStorage.getItem('pomodoro-mini-top');
  const base = `width=${MINI_POPUP_WIDTH},height=${MINI_POPUP_HEIGHT}`;
  if (left != null && top != null) {
    return `${base},left=${left},top=${top}`;
  }
  return base;
}

function openMiniPopup() {
  if (popupBlockedMessage) popupBlockedMessage.hidden = true;
  const miniUrl = new URL('mini.html', window.location.href).href;
  const features = getMiniPopupFeatures();
  const win = window.open(miniUrl, MINI_POPUP_NAME, features);
  if (!win) {
    if (popupBlockedMessage) popupBlockedMessage.hidden = false;
    return;
  }
  miniPopup = win;
  broadcastState(); // so popup gets current time as soon as it loads
  if (fullTimerView) fullTimerView.hidden = true;
  if (minimizedView) minimizedView.hidden = false;
  if (!popupCheckIntervalId) {
    popupCheckIntervalId = setInterval(() => {
      if (miniPopup && miniPopup.closed) {
        miniPopup = null;
        clearInterval(popupCheckIntervalId);
        popupCheckIntervalId = null;
        if (fullTimerView) fullTimerView.hidden = false;
        if (minimizedView) minimizedView.hidden = true;
      }
    }, 500);
  }
}

function restoreFullView() {
  if (miniPopup && !miniPopup.closed) {
    miniPopup.close();
  }
  miniPopup = null;
  if (popupCheckIntervalId) {
    clearInterval(popupCheckIntervalId);
    popupCheckIntervalId = null;
  }
  if (fullTimerView) fullTimerView.hidden = false;
  if (minimizedView) minimizedView.hidden = true;
}

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

/** Broadcast state to mini popup if open (no-op if not used). */
function broadcastState() {}

/** Refresh all timer UI from state. */
function updateDOM() {
  const formatted = formatTime(timeRemaining);
  timeDisplay.textContent = formatted;

  const displayMode = isRunning ? currentMode : 'paused';
  setMode(displayMode);
  modeIndicator.textContent = getModeLabel(currentMode);
  startPauseBtn.textContent = isRunning ? 'Pause' : 'Start';
  startPauseBtn.setAttribute('aria-label', isRunning ? 'Pause timer' : 'Start timer');

  broadcastState();
}

/** Start the next phase (work or break) with correct duration. */
function startPhase(mode) {
  currentMode = mode;
  timeRemaining = mode === 'work' ? workDurationSec : breakDurationSec;
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

function openSettings() {
  if (focusMinInput) focusMinInput.value = Math.round(workDurationSec / 60);
  if (breakMinInput) breakMinInput.value = Math.round(breakDurationSec / 60);
  if (settingsPanel) settingsPanel.hidden = false;
}

function closeSettings() {
  if (settingsPanel) settingsPanel.hidden = true;
}

function toggleSettings() {
  if (settingsPanel && settingsPanel.hidden) {
    openSettings();
  } else {
    closeSettings();
  }
}

function saveSettings() {
  const focusMin = focusMinInput ? focusMinInput.value : '';
  const breakMin = breakMinInput ? breakMinInput.value : '';
  saveDurationsToStorage(focusMin, breakMin);
  if (!isRunning) {
    startPhase(currentMode);
  }
  closeSettings();
}

// Event listeners
startPauseBtn.addEventListener('click', toggleStartPause);
resetBtn.addEventListener('click', reset);
if (popoutBtn) popoutBtn.addEventListener('click', openMiniPopup);
if (restoreBtn) restoreBtn.addEventListener('click', restoreFullView);
if (settingsBtn) settingsBtn.addEventListener('click', toggleSettings);
if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', saveSettings);
if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', closeSettings);

// Optional: save popup position when it closes (popup would need to postMessage; skip for simplicity)

// Initial state: load saved durations, work mode, full duration, not running
loadDurationsFromStorage();
startPhase('work');
