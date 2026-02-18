// Pomodoro Timer
const app = document.getElementById('app');

/** Set visual theme from current mode. Call when switching between work and break. */
export function setMode(mode) {
  if (mode === 'work' || mode === 'break') {
    app.dataset.mode = mode;
  }
}

// Default to work mode on load
setMode('work');
