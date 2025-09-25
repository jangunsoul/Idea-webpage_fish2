// Shared utility helpers used across the game scripts.

window.clamp = function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

window.lerp = function lerp(a, b, t) {
  return a + (b - a) * t;
};

window.rand = function rand(min, max) {
  return Math.random() * (max - min) + min;
};

window.randi = function randi(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

window.pick = function pick(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
};

window.loadImage = function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
};

window.getCssVar = function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name) || '';
};

window.toast = function toast(message) {
  const target = window.toastEl;
  if (!target) {
    console.warn('Toast element missing:', message);
    return;
  }
  target.textContent = message;
  target.classList.add('show');
  clearTimeout(target._hideTimer);
  target._hideTimer = setTimeout(() => target.classList.remove('show'), 2000);
};

window.showMissEffect = function showMissEffect() {
  if (!window.missEffect) return;
  window.missEffect.classList.remove('show');
  void window.missEffect.offsetWidth;
  window.missEffect.classList.add('show');
  clearTimeout(window.missEffect._hideTimer);
  window.missEffect._hideTimer = setTimeout(() => window.missEffect.classList.remove('show'), 500);
};

window.setHUD = function setHUD() {
  if (window.energyEl) window.energyEl.textContent = window.settings.energy;
  if (window.pointsEl) window.pointsEl.textContent = window.settings.points;
};

window.setGameplayLayout = function setGameplayLayout(active) {
  if (!window.canvas || !window.title || !window.distanceEl) return;
  if (active) {
    window.title.style.display = 'none';
    window.canvas.style.cursor = 'crosshair';
    window.distanceEl.style.display = 'block';
    const hud = document.querySelector('.hud');
    if (hud) hud.style.display = 'flex';
  } else {
    window.title.style.display = 'flex';
    window.canvas.style.cursor = 'default';
    window.distanceEl.style.display = 'none';
    if (window.minimap) window.minimap.style.display = 'none';
    const hud = document.querySelector('.hud');
    if (hud) hud.style.display = 'none';
  }
};

