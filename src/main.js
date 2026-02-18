// Pomodoro Timer
const app = document.getElementById('app');

/** Set visual theme from current mode. Call when switching work, break, or paused. */
export function setMode(mode) {
  if (mode === 'work' || mode === 'break' || mode === 'paused') {
    app.dataset.mode = mode;
  }
}

// Default to work mode on load
setMode('work');
