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
  if (window.energyEl) {
    const energy = window.settings.energy ?? 0;
    const maxEnergy = window.settings.energyMax ?? 10;
    const cooldown = window.settings.energyCooldown ?? 0;
    let text = `${energy}/${maxEnergy}`;
    if (energy < maxEnergy) {
      const seconds = Math.max(0, Math.ceil(cooldown) - 1);
      const minutesPart = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
      const secondsPart = (seconds % 60).toString().padStart(2, '0');
      text += ` (${minutesPart}:${secondsPart})`;
    }
    window.energyEl.textContent = text;
    window.energyEl.classList.toggle('overcap', energy > maxEnergy);
  }
  const pointsText = (window.settings.points ?? 0).toLocaleString();
  if (window.pointsEl) window.pointsEl.textContent = pointsText;
  if (window.shopPointsEl) window.shopPointsEl.textContent = pointsText;
  if (typeof window.updateShopAvailability === 'function') {
    window.updateShopAvailability();
  }
};

window.addPointsWithSparkle = function addPointsWithSparkle(amount) {
  if (!Number.isFinite(amount) || amount === 0) {
    window.setHUD();
    return;
  }
  window.settings.points += amount;
  window.setHUD();
  const target = window.pointsEl?.closest?.('.pill') || window.pointsEl;
  if (!target) return;
  target.classList.remove('sparkle');
  void target.offsetWidth;
  target.classList.add('sparkle');
  clearTimeout(target._sparkleTimer);
  target._sparkleTimer = setTimeout(() => target.classList.remove('sparkle'), 900);
};

window.spendPoints = function spendPoints(cost) {
  if (!Number.isFinite(cost) || cost <= 0) return true;
  const current = window.settings.points ?? 0;
  if (current < cost) return false;
  window.settings.points = current - cost;
  window.setHUD();
  return true;
};

window.addEnergy = function addEnergy(amount, options = {}) {
  if (!Number.isFinite(amount) || amount === 0) {
    window.setHUD();
    return window.settings.energy ?? 0;
  }
  const maxEnergy = window.settings.energyMax ?? 10;
  const regenInterval = window.settings.energyRegenInterval ?? 600;
  const current = window.settings.energy ?? 0;
  const next = Math.max(0, current + amount);
  window.settings.energy = next;
  if (next >= maxEnergy) {
    window.settings.energyCooldown = 0;
  } else if (amount > 0) {
    if (!Number.isFinite(window.settings.energyCooldown) || window.settings.energyCooldown <= 0) {
      window.settings.energyCooldown = regenInterval;
    }
  }
  window.setHUD();
  if (options.toast) {
    const message =
      typeof options.toast === 'string'
        ? options.toast
        : `Energy ${amount > 0 ? '+' : ''}${amount}`;
    window.toast(message);
  }
  return window.settings.energy;
};

window.addPointsWithSparkle = function addPointsWithSparkle(amount) {
  if (!Number.isFinite(amount) || amount === 0) {
    window.setHUD();
    return;
  }
  window.settings.points += amount;
  window.setHUD();
  const target = window.pointsEl?.closest?.('.pill') || window.pointsEl;
  if (!target) return;
  target.classList.remove('sparkle');
  void target.offsetWidth;
  target.classList.add('sparkle');
  clearTimeout(target._sparkleTimer);
  target._sparkleTimer = setTimeout(() => target.classList.remove('sparkle'), 900);
};

window.setGameplayLayout = function setGameplayLayout(active) {
  const container = document.getElementById('game');
  if (container) container.classList.toggle('gameplay', !!active);

  if (window.canvas) {
    window.canvas.style.cursor = active ? 'crosshair' : 'default';
  }

  if (window.distanceEl) {
    window.distanceEl.style.display = active ? 'block' : 'none';
  }

  if (!active && window.minimap) {
    window.minimap.style.display = 'none';
  }

  if (window.mainMenu) {
    window.mainMenu.setAttribute('aria-hidden', active ? 'true' : 'false');
  }

  if (window.navBar) {
    window.navBar.setAttribute('aria-hidden', active ? 'true' : 'false');
    window.navBar.querySelectorAll('button').forEach(btn => {
      btn.tabIndex = active ? -1 : 0;
    });
  }

  if (window.exitBtn) {
    window.exitBtn.setAttribute('aria-hidden', active ? 'false' : 'true');
    window.exitBtn.tabIndex = active ? 0 : -1;
  }

  if (window.autoBtn) {
    window.autoBtn.setAttribute('aria-hidden', active ? 'false' : 'true');
    window.autoBtn.tabIndex = active ? 0 : -1;
  }
};

