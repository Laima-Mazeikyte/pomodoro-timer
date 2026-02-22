// Pomodoro Timer – duration config & persistence
const FOCUS_STORAGE_KEY = 'pomodoro-focus-min';
const BREAK_STORAGE_KEY = 'pomodoro-break-min';
const LONG_BREAK_STORAGE_KEY = 'pomodoro-long-break-min';
const SOUND_MUTED_STORAGE_KEY = 'pomodoro-sound-muted';
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;
const DEFAULT_LONG_BREAK_MIN = 15;
const FOCUS_MIN = 1;
const FOCUS_MAX = 999;
const BREAK_MIN = 1;
const BREAK_MAX = 999;
const FOCUS_PRESETS = [60, 30, 45, 25, 20];
const BREAK_PRESETS = [5, 10, 15, 20];
const LONG_BREAK_PRESETS = [5, 10, 15, 20];

let focusDurationSec = DEFAULT_FOCUS_MIN * 60;
let breakDurationSec = DEFAULT_BREAK_MIN * 60;
let longBreakDurationSec = DEFAULT_LONG_BREAK_MIN * 60;

function loadDurationsFromStorage() {
  const focusMin = parseInt(localStorage.getItem(FOCUS_STORAGE_KEY), 10);
  const breakMin = parseInt(localStorage.getItem(BREAK_STORAGE_KEY), 10);
  const longBreakMin = parseInt(localStorage.getItem(LONG_BREAK_STORAGE_KEY), 10);
  const focus = Number.isNaN(focusMin) ? DEFAULT_FOCUS_MIN : Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, focusMin));
  const break_ = Number.isNaN(breakMin) ? DEFAULT_BREAK_MIN : Math.max(BREAK_MIN, Math.min(BREAK_MAX, breakMin));
  const longBreak = Number.isNaN(longBreakMin) ? DEFAULT_LONG_BREAK_MIN : Math.max(BREAK_MIN, Math.min(BREAK_MAX, longBreakMin));
  focusDurationSec = focus * 60;
  breakDurationSec = break_ * 60;
  longBreakDurationSec = longBreak * 60;
}

function saveDurationsToStorage(focusMin, breakMin, longBreakMin) {
  const focus = Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, Math.round(Number(focusMin)) || DEFAULT_FOCUS_MIN));
  const break_ = Math.max(BREAK_MIN, Math.min(BREAK_MAX, Math.round(Number(breakMin)) || DEFAULT_BREAK_MIN));
  const longBreak = Math.max(BREAK_MIN, Math.min(BREAK_MAX, Math.round(Number(longBreakMin)) || DEFAULT_LONG_BREAK_MIN));
  localStorage.setItem(FOCUS_STORAGE_KEY, String(focus));
  localStorage.setItem(BREAK_STORAGE_KEY, String(break_));
  localStorage.setItem(LONG_BREAK_STORAGE_KEY, String(longBreak));
  focusDurationSec = focus * 60;
  breakDurationSec = break_ * 60;
  longBreakDurationSec = longBreak * 60;
}

// State
let timeRemaining = focusDurationSec; // seconds
let isRunning = false;
let currentMode = 'focus'; // 'focus' | 'break' | 'longBreak'
let focusSessionsCompleted = 0;
let totalFocusCompleted = 0;
let totalShortBreaksCompleted = 0;
let totalLongBreaksCompleted = 0;
let intervalId = null;
let hasStarted = false; // true after user has pressed Play at least once
let soundMuted = false;

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
const muteBtn = document.getElementById('mute-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const focusMinInput = document.getElementById('focus-min-input');
const breakMinInput = document.getElementById('break-min-input');
const longBreakMinInput = document.getElementById('long-break-min-input');
const focusCustomWrap = document.getElementById('focus-custom-wrap');
const breakCustomWrap = document.getElementById('break-custom-wrap');
const longBreakCustomWrap = document.getElementById('long-break-custom-wrap');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsApplyNotice = document.getElementById('settings-apply-notice');

const MINI_POPUP_NAME = 'pomodoro-mini';
const MINI_POPUP_WIDTH = 220;
const MINI_POPUP_HEIGHT = 140;
let miniPopup = null;
let popupCheckIntervalId = null;

let audioContext = null;
const MODE_SWITCH_FLASH_DURATION_MS = 450;

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

/** Set visual theme from current mode. Call when switching focus, break, paused, or idle. */
export function setMode(mode) {
  if (mode === 'focus' || mode === 'break' || mode === 'longBreak' || mode === 'paused' || mode === 'idle') {
    // Long break uses same colourway as break
    const themeMode = mode === 'longBreak' ? 'break' : mode;
    app.dataset.mode = themeMode;
    document.body.dataset.mode = themeMode;
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
  if (mode === 'focus') return 'Focus';
  if (mode === 'longBreak') return 'Long break';
  return 'Break';
}

/** Return tab title string from current state (idle / running / paused). Label at end. */
function getTabTitle() {
  if (!hasStarted) return 'Start Pomo';
  const label = getModeLabel(currentMode);
  const time = formatTime(timeRemaining);
  // Time first, then label (e.g. "24:59 Focus")
  return isRunning ? time + ' ' + label : time + ' (paused) ' + label;
}

/** Bump this when you replace favicon files so browsers load the new assets. */
const FAVICON_VERSION = 3;

/** Return favicon state key for current display mode and phase (idle, focus, break, paused-focus, paused-break). Long break uses break favicon. */
function getFaviconKey(displayMode, currentMode) {
  const faviconMode = currentMode === 'longBreak' ? 'break' : currentMode;
  return displayMode === 'paused' ? 'paused-' + faviconMode : faviconMode;
}

/** Broadcast state to mini popup if open (no-op if not used). */
function broadcastState() {}

/**
 * One line = one classic set: F, B, F, B, F, B, F, LB.
 * Indicators appear on status change: we show completed phases plus the current phase.
 * After long break we clear (new set) and show only the first focus indicator.
 */
function getCurrentSetCounts() {
  const setIndex = totalLongBreaksCompleted;
  const completedFocus = Math.min(4, Math.max(0, totalFocusCompleted - 4 * setIndex));
  const focus = Math.min(4, completedFocus + (currentMode === 'focus' ? 1 : 0));
  const completedShortBreak = Math.min(3, Math.max(0, totalShortBreaksCompleted - 3 * setIndex));
  const shortBreak = Math.min(3, completedShortBreak + (currentMode === 'break' ? 1 : 0));
  const longBreak = currentMode === 'longBreak' ? 1 : 0;
  return { focus, shortBreak, longBreak };
}

/** Build ordered list for current set: F, B, F, B, F, B, F, LB. */
function getCurrentSetDotsOrder() {
  const { focus, shortBreak, longBreak } = getCurrentSetCounts();
  const order = [];
  let fi = 0;
  let bi = 0;
  for (let i = 0; i < 4; i++) {
    if (fi < focus) {
      order.push('focus');
      fi++;
    }
    if (i < 3 && bi < shortBreak) {
      order.push('break');
      bi++;
    }
  }
  if (longBreak > 0) order.push('longBreak');
  return order;
}

/** Render session dots (and pills for long breaks) into #session-dots. Shows only the current set. Hidden in idle state. */
function renderSessionDots() {
  const container = document.getElementById('session-dots');
  if (!container) return;
  if (!hasStarted) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }
  const types = getCurrentSetDotsOrder();
  container.hidden = types.length === 0;
  if (types.length === 0) {
    container.replaceChildren();
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const type of types) {
    if (type === 'longBreak') {
      const pill = document.createElement('span');
      pill.className = 'session-dots__pill';
      pill.setAttribute('aria-hidden', 'true');
      fragment.appendChild(pill);
    } else {
      const dot = document.createElement('span');
      dot.className = 'session-dots__dot session-dots__dot--' + (type === 'focus' ? 'focus' : 'break');
      dot.setAttribute('aria-hidden', 'true');
      fragment.appendChild(dot);
    }
  }
  container.replaceChildren(fragment);
}

/** Refresh all timer UI from state. */
function updateDOM() {
  const formatted = formatTime(timeRemaining);
  timeDisplay.textContent = formatted;

  const displayMode = isRunning ? currentMode : (hasStarted ? 'paused' : 'idle');
  setMode(displayMode);
  const favicon = document.querySelector('link#favicon');
  if (favicon) favicon.href = '/favicon-' + getFaviconKey(displayMode, currentMode) + '.svg?v=' + FAVICON_VERSION;
  modeIndicator.textContent = getModeLabel(currentMode);

  // Start/Pause: swap icon by state (only play or only pause visible)
  startPauseBtn.classList.toggle('is-running', isRunning);
  startPauseBtn.setAttribute('aria-label', isRunning ? 'Pause timer' : 'Start timer');

  // Reset: visible only after user has started the timer; when hidden, keep out of focus order
  if (resetBtn) {
    resetBtn.hidden = !hasStarted;
    resetBtn.setAttribute('aria-hidden', hasStarted ? 'false' : 'true');
    resetBtn.tabIndex = hasStarted ? 0 : -1;
  }

  renderSessionDots();
  broadcastState();
  document.title = getTabTitle();
}

/** Start the next phase (focus, break, or long break) with correct duration. */
function startPhase(mode) {
  currentMode = mode;
  if (mode === 'focus') {
    timeRemaining = focusDurationSec;
  } else if (mode === 'longBreak') {
    timeRemaining = longBreakDurationSec;
  } else {
    timeRemaining = breakDurationSec;
  }
  updateDOM();
}

/** Ensure AudioContext is created and resumed (call after user gesture so autoplay allows sound). */
function ensureAudioContext() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

/**
 * Play a warm, soft tone with optional harmonic layer and gentle envelope.
 * @param {Object} options
 * @param {number} options.frequency - Base frequency (Hz)
 * @param {number} options.duration - Total duration (seconds)
 * @param {number} options.gain - Peak gain (0–1)
 * @param {number} [options.attack=0.02] - Fade-in time (seconds)
 * @param {Object} [options.harmonic] - Optional second oscillator for warmth
 * @param {number} options.harmonic.ratio - Frequency multiplier (e.g. 1.5 or 2)
 * @param {number} [options.harmonic.gainMultiplier=0.25] - Gain of harmonic relative to main
 * @param {number} [options.detune=4] - Detune of harmonic (Hz) for organic feel
 * @param {number} [options.startTime] - When to start (default: now)
 */
function playWarmTone(options = {}) {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  const now = options.startTime ?? audioContext.currentTime;
  const {
    frequency = 520,
    duration = 0.2,
    gain: gainValue = 0.08,
    attack = 0.02,
    harmonic,
    detune = 4,
  } = options;

  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(gainValue, now + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const osc = audioContext.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  osc.connect(gainNode);
  osc.start(now);
  osc.stop(now + duration);

  if (harmonic) {
    const ratio = harmonic.ratio ?? 1.5;
    const harmGain = gainValue * (harmonic.gainMultiplier ?? 0.25);
    const harmGainNode = audioContext.createGain();
    harmGainNode.gain.setValueAtTime(harmGain, now);
    harmGainNode.connect(gainNode);
    const osc2 = audioContext.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = frequency * ratio;
    osc2.detune.value = detune;
    osc2.connect(harmGainNode);
    osc2.start(now);
    osc2.stop(now + duration);
  }

  gainNode.connect(audioContext.destination);
}

/** Play the same rising-interval sound as start when the new phase begins. */
function playModeSwitchSound() {
  playStartSound();
}

/** Play a soft rising interval when the user starts the timer (e.g. C to E). */
function playStartSound() {
  if (soundMuted || !audioContext) return;
  const now = audioContext.currentTime;
  playWarmTone({
    frequency: 440,
    duration: 0.12,
    gain: 0.04,
    attack: 0.03,
    harmonic: { ratio: 2, gainMultiplier: 0.2 },
    startTime: now,
  });
  playWarmTone({
    frequency: 554,
    duration: 0.1,
    gain: 0.035,
    attack: 0.02,
    harmonic: { ratio: 2, gainMultiplier: 0.2 },
    startTime: now + 0.07,
  });
}

/** Pitch (Hz) for each countdown second for a "winding down" feel. */
const COUNTDOWN_PITCH_MAP = { 5: 640, 4: 560, 3: 480, 2: 420, 1: 360 };

/** Play a soft tick for the last-5-seconds countdown; descending pitch only (no extra tone on 1). */
function playCountdownTick(secondsLeft) {
  if (soundMuted || !audioContext) return;
  const frequency = COUNTDOWN_PITCH_MAP[secondsLeft] ?? 520;
  playWarmTone({
    frequency,
    duration: 0.07,
    gain: 0.04,
    attack: 0.01,
    harmonic: { ratio: 2, gainMultiplier: 0.2 },
  });
}

/** Trigger visual flash and sound for auto mode switch; remove flash after animation. */
function triggerModeSwitchNotifications() {
  document.body.classList.add('mode-switch-flash');
  setTimeout(() => {
    document.body.classList.remove('mode-switch-flash');
  }, MODE_SWITCH_FLASH_DURATION_MS);
  playModeSwitchSound();
}

/** Complete current phase and start the next. Totals reflect the phase we just completed (indicators appear on status change). */
function completeCurrentPhaseAndGoToNext() {
  let nextMode;
  if (currentMode === 'focus') {
    focusSessionsCompleted += 1;
    nextMode = focusSessionsCompleted === 4 ? 'longBreak' : 'break';
    if (nextMode === 'longBreak') focusSessionsCompleted = 0;
  } else {
    nextMode = 'focus';
  }
  if (currentMode === 'focus') {
    totalFocusCompleted += 1;
  } else if (currentMode === 'break') {
    totalShortBreaksCompleted += 1;
  } else if (currentMode === 'longBreak') {
    totalLongBreaksCompleted += 1;
  }
  startPhase(nextMode);
  triggerModeSwitchNotifications();
}

/** Called every second when timer is running. */
function tick() {
  if (timeRemaining <= 0) {
    completeCurrentPhaseAndGoToNext();
    return;
  }
  // Soft countdown tick when 5, 4, 3, 2, or 1 seconds left (descending pitch; phase-change sound plays at 0)
  if (timeRemaining >= 1 && timeRemaining <= 5) {
    playCountdownTick(timeRemaining);
  }
  timeRemaining -= 1;
  updateDOM();
}

/** Start or pause the countdown. */
function toggleStartPause() {
  isRunning = !isRunning;
  if (isRunning) {
    hasStarted = true;
    ensureAudioContext();
    if (audioContext?.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    playStartSound();
    intervalId = setInterval(tick, 1000);
  } else {
    clearInterval(intervalId);
    intervalId = null;
    setMode('paused');
  }
  updateDOM();
}

/** Stop timer and reset to focus mode with full focus duration. */
function reset() {
  hasStarted = false;
  isRunning = false;
  focusSessionsCompleted = 0;
  totalFocusCompleted = 0;
  totalShortBreaksCompleted = 0;
  totalLongBreaksCompleted = 0;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  startPhase('focus');
}

function setCustomInputFocusable(input, focusable) {
  if (!input) return;
  if (focusable) {
    input.removeAttribute('tabindex');
    input.removeAttribute('aria-hidden');
  } else {
    input.setAttribute('tabindex', '-1');
    input.setAttribute('aria-hidden', 'true');
  }
}

function selectFocusPreset(minutes) {
  const val = Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, minutes));
  if (focusMinInput) focusMinInput.value = val;
  if (focusCustomWrap) focusCustomWrap.hidden = true;
  setCustomInputFocusable(focusMinInput, false);
  settingsPanel.querySelectorAll('[data-focus-preset], [data-focus-custom]').forEach((btn) => {
    const isPreset = btn.hasAttribute('data-focus-preset');
    const match = isPreset && Number(btn.getAttribute('data-focus-preset')) === val;
    const isCustom = btn.hasAttribute('data-focus-custom');
    btn.setAttribute('aria-pressed', (!isCustom && match) || (isCustom && !FOCUS_PRESETS.includes(val)) ? 'true' : 'false');
  });
}

function selectFocusCustom() {
  if (focusMinInput) focusMinInput.value = Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, Math.round(focusDurationSec / 60) || DEFAULT_FOCUS_MIN));
  if (focusCustomWrap) focusCustomWrap.hidden = false;
  setCustomInputFocusable(focusMinInput, true);
  settingsPanel.querySelectorAll('[data-focus-preset], [data-focus-custom]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.hasAttribute('data-focus-custom') ? 'true' : 'false');
  });
  focusMinInput?.focus();
}

function selectBreakPreset(minutes) {
  const val = Math.max(BREAK_MIN, Math.min(BREAK_MAX, minutes));
  if (breakMinInput) breakMinInput.value = val;
  if (breakCustomWrap) breakCustomWrap.hidden = true;
  setCustomInputFocusable(breakMinInput, false);
  settingsPanel.querySelectorAll('[data-break-preset], [data-break-custom]').forEach((btn) => {
    const isPreset = btn.hasAttribute('data-break-preset');
    const match = isPreset && Number(btn.getAttribute('data-break-preset')) === val;
    const isCustom = btn.hasAttribute('data-break-custom');
    btn.setAttribute('aria-pressed', (!isCustom && match) || (isCustom && !BREAK_PRESETS.includes(val)) ? 'true' : 'false');
  });
}

function selectBreakCustom() {
  if (breakMinInput) breakMinInput.value = Math.max(BREAK_MIN, Math.min(BREAK_MAX, Math.round(breakDurationSec / 60) || DEFAULT_BREAK_MIN));
  if (breakCustomWrap) breakCustomWrap.hidden = false;
  setCustomInputFocusable(breakMinInput, true);
  settingsPanel.querySelectorAll('[data-break-preset], [data-break-custom]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.hasAttribute('data-break-custom') ? 'true' : 'false');
  });
  breakMinInput?.focus();
}

function selectLongBreakPreset(minutes) {
  const val = Math.max(BREAK_MIN, Math.min(BREAK_MAX, minutes));
  if (longBreakMinInput) longBreakMinInput.value = val;
  if (longBreakCustomWrap) longBreakCustomWrap.hidden = true;
  setCustomInputFocusable(longBreakMinInput, false);
  settingsPanel.querySelectorAll('[data-long-break-preset], [data-long-break-custom]').forEach((btn) => {
    const isPreset = btn.hasAttribute('data-long-break-preset');
    const match = isPreset && Number(btn.getAttribute('data-long-break-preset')) === val;
    const isCustom = btn.hasAttribute('data-long-break-custom');
    btn.setAttribute('aria-pressed', (!isCustom && match) || (isCustom && !LONG_BREAK_PRESETS.includes(val)) ? 'true' : 'false');
  });
}

function selectLongBreakCustom() {
  if (longBreakMinInput) longBreakMinInput.value = Math.max(BREAK_MIN, Math.min(BREAK_MAX, Math.round(longBreakDurationSec / 60) || DEFAULT_LONG_BREAK_MIN));
  if (longBreakCustomWrap) longBreakCustomWrap.hidden = false;
  setCustomInputFocusable(longBreakMinInput, true);
  settingsPanel.querySelectorAll('[data-long-break-preset], [data-long-break-custom]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.hasAttribute('data-long-break-custom') ? 'true' : 'false');
  });
  longBreakMinInput?.focus();
}

function openSettings() {
  const focusMin = Math.round(focusDurationSec / 60);
  const breakMin = Math.round(breakDurationSec / 60);
  const longBreakMin = Math.round(longBreakDurationSec / 60);
  if (focusMinInput) focusMinInput.value = Math.max(FOCUS_MIN, Math.min(FOCUS_MAX, focusMin));
  if (breakMinInput) breakMinInput.value = Math.max(BREAK_MIN, Math.min(BREAK_MAX, breakMin));
  if (longBreakMinInput) longBreakMinInput.value = Math.max(BREAK_MIN, Math.min(BREAK_MAX, longBreakMin));
  if (FOCUS_PRESETS.includes(focusMin)) {
    selectFocusPreset(focusMin);
  } else {
    selectFocusCustom();
  }
  if (BREAK_PRESETS.includes(breakMin)) {
    selectBreakPreset(breakMin);
  } else {
    selectBreakCustom();
  }
  if (LONG_BREAK_PRESETS.includes(longBreakMin)) {
    selectLongBreakPreset(longBreakMin);
  } else {
    selectLongBreakCustom();
  }
  if (settingsApplyNotice) {
    if (!hasStarted) {
      settingsApplyNotice.hidden = true;
      settingsApplyNotice.textContent = '';
    } else {
      settingsApplyNotice.hidden = false;
      settingsApplyNotice.textContent =
        currentMode === 'focus'
          ? 'Changes apply from your next focus session.'
          : 'Changes apply from your next break.';
    }
  }
  if (settingsPanel) settingsPanel.hidden = false;
  if (app) app.classList.add('settings-open');
}

function closeSettings() {
  if (settingsPanel) settingsPanel.hidden = true;
  if (app) app.classList.remove('settings-open');
}

function toggleSettings() {
  if (settingsPanel && settingsPanel.hidden) {
    openSettings();
  } else {
    closeSettings();
  }
}

function loadSoundMutedFromStorage() {
  const stored = localStorage.getItem(SOUND_MUTED_STORAGE_KEY);
  soundMuted = stored === 'true';
}

function updateMuteButtonUI() {
  if (!muteBtn) return;
  const iconOn = muteBtn.querySelector('.mute-btn__icon--on');
  const iconOff = muteBtn.querySelector('.mute-btn__icon--off');
  if (iconOn) iconOn.hidden = soundMuted;
  if (iconOff) iconOff.hidden = !soundMuted;
  muteBtn.setAttribute('aria-label', soundMuted ? 'Unmute sounds' : 'Mute sounds');
  muteBtn.setAttribute('aria-pressed', String(soundMuted));
}

function toggleMute() {
  soundMuted = !soundMuted;
  localStorage.setItem(SOUND_MUTED_STORAGE_KEY, String(soundMuted));
  updateMuteButtonUI();
}

function saveSettings() {
  const focusMin = focusMinInput ? focusMinInput.value : '';
  const breakMin = breakMinInput ? breakMinInput.value : '';
  const longBreakMin = longBreakMinInput ? longBreakMinInput.value : '';
  saveDurationsToStorage(focusMin, breakMin, longBreakMin);
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
if (muteBtn) muteBtn.addEventListener('click', toggleMute);
if (settingsBtn) settingsBtn.addEventListener('click', toggleSettings);
if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', saveSettings);
if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', closeSettings);
if (settingsPanel) {
  settingsPanel.addEventListener('click', (e) => {
    let target = e.target;
    while (target && target !== settingsPanel) {
      if (target.nodeType === 1 && target.tagName === 'BUTTON' && target.classList.contains('settings-panel__preset')) break;
      target = target.parentElement;
    }
    if (!target || target === settingsPanel) return;
    const focusPreset = target.getAttribute('data-focus-preset');
    const focusCustom = target.hasAttribute('data-focus-custom');
    const breakPreset = target.getAttribute('data-break-preset');
    const breakCustom = target.hasAttribute('data-break-custom');
    const longBreakPreset = target.getAttribute('data-long-break-preset');
    const longBreakCustom = target.hasAttribute('data-long-break-custom');
    if (focusPreset != null) selectFocusPreset(Number(focusPreset));
    else if (focusCustom) selectFocusCustom();
    else if (breakPreset != null) selectBreakPreset(Number(breakPreset));
    else if (breakCustom) selectBreakCustom();
    else if (longBreakPreset != null) selectLongBreakPreset(Number(longBreakPreset));
    else if (longBreakCustom) selectLongBreakCustom();
  });
}

// Optional: save popup position when it closes (popup would need to postMessage; skip for simplicity)

// Initial state: load saved durations, focus mode, full duration, not running
loadDurationsFromStorage();
loadSoundMutedFromStorage();
updateMuteButtonUI();
startPhase('focus');
