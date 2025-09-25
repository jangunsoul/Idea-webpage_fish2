// Main game bootstrap and high-level orchestration logic.
// Relies on global state defined in state.js and helpers from utils.js.

(function () {
  function ensureDomReferences() {
    window.canvas = document.getElementById('view');
    window.ctx = window.canvas?.getContext('2d') ?? null;
    window.startBtn = document.getElementById('startBtn');
    window.title = document.getElementById('title');
    window.gauge = document.getElementById('gauge');
    window.bar = document.getElementById('bar');
    window.sweet = document.getElementById('sweet');
    window.cursor = document.getElementById('cursor');
    window.toastEl = document.getElementById('toast');
    window.missEffect = document.getElementById('missEffect');
    window.distanceEl = document.getElementById('distance');
    window.minimap = document.getElementById('minimap');
    window.mmbar = document.getElementById('mmbar');
    window.results = document.getElementById('results');
    window.rTitle = document.getElementById('rTitle');
    window.rBody = document.getElementById('rBody');
    window.rNext = document.getElementById('rNext');
    window.rSkip = document.getElementById('rSkip');
    window.energyEl = document.getElementById('energy');
    window.pointsEl = document.getElementById('points');

    if (!window.canvas || !window.ctx || !window.startBtn) {
      throw new Error('Essential DOM elements are missing.');
    }
  }

  function resizeCanvas() {
    if (!window.canvas) return;
    const rect = window.canvas.getBoundingClientRect();
    window.canvas.width = rect.width;
    window.canvas.height = rect.height;
  }

  async function loadGameData() {
    if (window.loadingPromise) return window.loadingPromise;

    window.startBtn.textContent = 'Loading data...';
    window.startBtn.classList.add('disabled');
    window.startBtn.classList.remove('error');

    window.loadingPromise = (async () => {
      try {
        const response = await fetch(window.DATA_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        hydrateGameData(data);
        await prepareAssets();
        window.dataLoaded = true;
        window.startBtn.textContent = 'Touch to Start';
        window.startBtn.classList.remove('disabled', 'error');
        return true;
      } catch (err) {
        console.error('Failed to load game data:', err);
        window.dataLoaded = false;
        window.assetsReady = false;
        window.startBtn.textContent = 'Retry Data Load';
        window.startBtn.classList.remove('disabled');
        window.startBtn.classList.add('error');
        window.toast('Failed to load fish data');
        return false;
      } finally {
        window.loadingPromise = null;
      }
    })();

    return window.loadingPromise;
  }

  function hydrateGameData(data) {
    window.gameData.assets = data.assets || {};
    window.gameData.species = Array.isArray(data.species) ? data.species : [];
    window.gameData.characters = Array.isArray(data.characters) ? data.characters : [];
    window.gameData.environment = data.environment || null;
    window.gameData.player = data.player || null;
    window.SPECIES = window.gameData.species;
    window.CHARACTERS = window.gameData.characters;
    if (window.gameData.resources?.icons) {
      window.gameData.resources.icons.star = null;
    }

    const env = window.gameData.environment || {};
    if (env.tileWidth > 0) window.environmentState.tileWidth = env.tileWidth;
    if (env.tileHeight > 0) window.environmentState.tileHeight = env.tileHeight;
    if (env.landRows > 0) window.environmentState.landRows = Math.max(1, Math.floor(env.landRows));
    window.environmentState.sources = {
      water: env.waterTile || null,
      shore: env.shoreTile || null,
      land: env.landTile || null
    };

    applyPlayerConfig();
  }

  function applyPlayerConfig() {
    const base = window.gameData.player || {};
    const playerChar = window.CHARACTERS.find(c => c && c.role === 'Player') || null;
    const charAnim = playerChar?.animation || {};

    window.characterSprite.spriteSource = base.spriteSheet || charAnim.spriteSheet || window.characterSprite.spriteSource;
    window.characterSprite.frameWidth = base.frameWidth || charAnim.frameWidth || window.characterSprite.frameWidth;
    window.characterSprite.frameHeight = base.frameHeight || charAnim.frameHeight || window.characterSprite.frameHeight;
    window.characterSprite.frameCount = base.frameCount || charAnim.frameCount || window.characterSprite.frameCount;
    window.characterSprite.idleFrame = base.idleFrame ?? charAnim.idleFrame ?? window.characterSprite.idleFrame;
    window.characterSprite.postCastFrame = base.postCastFrame ?? charAnim.postCastFrame ?? window.characterSprite.postCastFrame;
    if (base.castSequence || charAnim.castSequence) {
      window.characterSprite.castSequence = (base.castSequence || charAnim.castSequence).slice();
    }
    const frameDuration = base.frameDurationMs || charAnim.frameDurationMs;
    if (frameDuration) window.characterSprite.frameDuration = frameDuration / 1000;
    window.characterSprite.scale = base.scale || charAnim.scale || window.characterSprite.scale;
    window.characterSprite.lineAnchor = base.lineAnchor || charAnim.lineAnchor || window.characterSprite.lineAnchor;
    window.characterSprite.holdFrame = window.characterSprite.postCastFrame
      ?? window.characterSprite.castSequence[window.characterSprite.castSequence.length - 1]
      ?? 0;
    if (!window.characterSprite.castSequence.length) {
      window.characterSprite.castSequence = [window.characterSprite.idleFrame, window.characterSprite.postCastFrame];
    }
    resetCharacterToIdle();
  }

  function resetCharacterToIdle() {
    window.characterSprite.playing = false;
    window.characterSprite.animationIndex = 0;
    window.characterSprite.timer = 0;
    window.characterSprite.currentFrame = window.characterSprite.idleFrame || 0;
    window.characterSprite.holdFrame = window.characterSprite.postCastFrame ?? window.characterSprite.currentFrame;
  }

  function startCharacterCastAnimation() {
    if (!window.characterSprite.castSequence.length) return;
    window.characterSprite.playing = true;
    window.characterSprite.animationIndex = 0;
    window.characterSprite.timer = 0;
    window.characterSprite.currentFrame = window.characterSprite.castSequence[0] ?? 0;
    window.characterSprite.holdFrame = window.characterSprite.postCastFrame
      ?? window.characterSprite.castSequence[window.characterSprite.castSequence.length - 1]
      ?? window.characterSprite.currentFrame;
  }

  async function prepareAssets() {
    if (window.assetsReady) return true;
    if (window.assetPrepPromise) return window.assetPrepPromise;

    const tasks = [];
    const seen = new Map();
    const fishCache = new Map();

    const queue = (src, assign) => {
      if (!src) return;
      let loader = seen.get(src);
      if (!loader) {
        loader = window.loadImage(src);
        seen.set(src, loader);
      }
      tasks.push(loader.then(img => assign(img)).catch(err => console.warn('Asset load failed:', src, err)));
    };

    for (const spec of window.SPECIES) {
      const imgInfo = spec.images || {};
      const src = imgInfo.card || imgInfo.illustration || imgInfo.sprite || imgInfo.spriteSheet;
      if (!src) continue;
      queue(src, img => fishCache.set(spec.id, img));
    }

    const sources = window.environmentState.sources || {};
    queue(sources.water, img => { window.environmentState.water = img; });
    queue(sources.shore, img => {
      window.environmentState.shore = img;
      if (!window.gameData.environment?.tileWidth) window.environmentState.tileWidth = img.width;
      if (!window.gameData.environment?.tileHeight) window.environmentState.tileHeight = img.height;
    });
    queue(sources.land, img => { window.environmentState.land = img; });
    if (window.characterSprite.spriteSource) {
      queue(window.characterSprite.spriteSource, img => { window.characterSprite.image = img; });
    }

    window.assetPrepPromise = Promise.all(tasks).then(() => {
      window.gameData.resources.fish = fishCache;
      window.assetsReady = true;
      initPassingSchool(window.passingSchoolMode);
      resetCharacterToIdle();
      return true;
    }).catch(err => {
      window.assetsReady = false;
      throw err;
    }).finally(() => {
      window.assetPrepPromise = null;
    });

    return window.assetPrepPromise;
  }

  function initPassingSchool(mode = 'title') {
    window.passingSchoolMode = mode;
    if (mode !== 'title') {
      window.passingSchool = [];
      return;
    }

    const entries = Array.from(window.gameData.resources.fish.entries());
    if (!entries.length) {
      window.passingSchool = [];
      return;
    }

    const count = Math.min(18, Math.max(8, entries.length * 2));
    window.passingSchool = Array.from({ length: count }, (_, i) => {
      const [id, img] = entries[i % entries.length];
      return {
        id,
        img,
        scale: 0.55 + Math.random() * 0.45,
        baseX: Math.random(),
        baseY: Math.random(),
        xAmp: 0.35 + Math.random() * 0.4,
        yAmp: 0.25 + Math.random() * 0.35,
        xSpeed: 0.6 + Math.random() * 1.0,
        ySpeed: 0.45 + Math.random() * 0.85,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2
      };
    });
  }

  function drawPassingSchool(W, H) {
    if (!window.passingSchool.length || !window.ctx) return;
    const time = window.globalTime;
    const baseY = H * 0.4;
    for (const fish of window.passingSchool) {
      const x = W * (fish.baseX + Math.sin(time * fish.xSpeed + fish.phaseX) * fish.xAmp * 0.2);
      const y = baseY + Math.sin(time * fish.ySpeed + fish.phaseY) * fish.yAmp * 120;
      const img = fish.img;
      const scale = fish.scale * 0.7;
      const width = img.width * scale;
      const height = img.height * scale;
      window.ctx.save();
      window.ctx.globalAlpha = 0.55;
      window.ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
      window.ctx.restore();
    }
  }

  function startCasting() {
    window.setGameplayLayout(true);
    window.camera.y = 0;
    window.settings.energy--;
    window.setHUD();
    window.title.style.display = 'none';
    window.gauge.style.display = 'flex';
    window.state = window.GameState.Casting;

    const barRect = window.bar.getBoundingClientRect();
    const w = barRect.width;
    const cursorW = 5;
    let dir = 1;
    let x = 0;
    const speed = w * 1.4;

    function frame(ts) {
      if (window.state !== window.GameState.Casting) return;
      if (!frame.last) frame.last = ts;
      const dt = (ts - frame.last) / 1000;
      frame.last = ts;
      x += dir * speed * dt;
      if (x <= 0) { x = 0; dir = 1; }
      if (x >= w - cursorW) { x = w - cursorW; dir = -1; }
      window.cursor.style.left = `${x}px`;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    const stop = () => {
      window.bar.removeEventListener('click', stop);
      window.gauge.style.display = 'none';
      const sweetRect = window.sweet.getBoundingClientRect();
      const sweetCenter = sweetRect.left + sweetRect.width / 2;
      const cursorCenter = barRect.left + x + cursorW / 2;
      const dx = Math.abs(cursorCenter - sweetCenter);
      const max = sweetRect.width / 2;
      const closeness = window.clamp(1 - dx / max, 0, 1);
      const distance = Math.round(window.lerp(window.settings.baseCast, window.settings.maxCast, closeness));
      startFlight(distance);
    };
    window.bar.addEventListener('click', stop);
  }

  function startFlight(dist) {
    window.state = window.GameState.Flight;
    window.world.castDistance = dist;
    window.world.bobberDist = 0;
    const metrics = getEnvironmentMetrics(window.canvas.clientWidth, window.canvas.clientHeight);
    const spawnInfo = spawnFishes(dist, metrics, window.canvas.clientWidth);
    window.world.fishes = spawnInfo.fishes;
    window.world.lateralLimit = spawnInfo.lateralLimit;
    window.world.displayRange = spawnInfo.displayRange;
    window.world.actives = [];
    window.world.catches = [];
    window.world.time = 0;
    startCharacterCastAnimation();
    window.distanceEl.style.display = 'block';
    window.minimap.style.display = 'none';
  }

  function startFishing() {
    window.state = window.GameState.Fishing;
    window.world.bobberDist = window.world.castDistance;
    window.minimap.style.display = 'block';
    window.distanceEl.style.display = 'block';
  }

  function endRunNoCatch() {
    window.toast('No Fish Caught');
    setTimeout(() => {
      window.state = window.GameState.Idle;
      window.title.style.display = 'flex';
      resetCharacterToIdle();
      window.setGameplayLayout(false);
    }, 700);
  }

  function showResults() {
    window.state = window.GameState.Results;
    window.resultsIndex = 0;
    window.results.style.display = 'flex';
    window.minimap.style.display = 'none';
    renderResultCard();
  }

  function renderResultCard() {
    const count = window.world.catches.length;
    if (window.resultsIndex >= count) {
      window.rTitle.textContent = 'All Done!';
      window.rBody.innerHTML = '<p>Great fishing session!</p>';
      window.rNext.textContent = 'Continue';
      return;
    }

    const fish = window.world.catches[window.resultsIndex];
    const points = computePoints(fish, window.world.castDistance);
    window.settings.points += points;
    window.setHUD();

    window.rTitle.textContent = `Catch ${window.resultsIndex + 1}/${count}`;
    window.rBody.innerHTML = `
      <div style="margin: 20px 0;">
        <h4 style="color: ${fish.spec.ui.mapColorHex}; margin-bottom: 10px;">${fish.spec.displayName}</h4>
        <p><strong>Size:</strong> ${fish.size_cm.toFixed(1)} cm</p>
        <p><strong>Weight:</strong> ${fish.weight_kg.toFixed(2)} kg</p>
        <p><strong>Rarity:</strong> ${fish.spec.rarity}</p>
        <p><strong>Points:</strong> ${points}</p>
      </div>
    `;
    window.rNext.textContent = window.resultsIndex < count - 1 ? 'Next' : 'Continue';
  }

  function updateMinimap() {
    if (!window.mmbar) return;

    window.mmbar.innerHTML = '<div class="mmcenter"></div>';

    const mapWidth = 120;
    const mapHeight = 60;
    const range = 26;

    for (const fish of window.world.fishes) {
      if (!fish || fish.finished) continue;
      const fishX = fish.position?.x ?? 0;
      const fishY = fish.position?.y ?? fish.distance;
      const dx = fishX;
      const dy = fishY - window.world.bobberDist;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= window.DETECTION_RANGE_M) {
        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.width = '4px';
        dot.style.height = '4px';
        dot.style.backgroundColor = fish.iconColor;
        dot.style.borderRadius = '50%';
        dot.style.left = (mapWidth * 0.5 + (fishX / range) * mapWidth * 0.4) + 'px';
        dot.style.top = (mapHeight * 0.5 + (dy / range) * mapHeight * 0.4) + 'px';
        dot.style.transform = 'translate(-50%, -50%)';
        if (fish.engaged) {
          dot.style.border = '1px solid white';
          dot.style.width = '6px';
          dot.style.height = '6px';
        }
        window.mmbar.appendChild(dot);
      }
    }

    const rangeCircle = document.createElement('div');
    rangeCircle.style.position = 'absolute';
    rangeCircle.style.left = '50%';
    rangeCircle.style.top = '50%';
    rangeCircle.style.transform = 'translate(-50%, -50%)';
    rangeCircle.style.width = (window.DETECTION_RANGE_M / range * mapWidth * 0.8) + 'px';
    rangeCircle.style.height = (window.DETECTION_RANGE_M / range * mapHeight * 0.8) + 'px';
    rangeCircle.style.border = '1px solid rgba(91, 192, 190, 0.5)';
    rangeCircle.style.borderRadius = '50%';
    rangeCircle.style.pointerEvents = 'none';
    window.mmbar.appendChild(rangeCircle);
  }

  function render() {
    if (!window.canvas || !window.ctx) return;

    const W = window.canvas.width;
    const H = window.canvas.height;

    window.ctx.clearRect(0, 0, W, H);
    const metrics = getEnvironmentMetrics(W, H);
    drawEnvironment(W, H, metrics, window.camera.y);
    if (window.state === window.GameState.Idle) {
      drawPassingSchool(W, H);
    }
    drawCharacterSprite(W, H, metrics, window.camera.y);

    if (window.state === window.GameState.Flight || window.state === window.GameState.Fishing) {
      const distancePx = window.world.bobberDist * metrics.pxPerMeter;
      const bobberWorldY = metrics.waterSurfaceY - distancePx;
      const bobberScreenY = bobberWorldY + window.camera.y;
      const bobberX = W * 0.5 + metrics.bobberOffsetX;

      drawFishingLine(window.rodAnchor.x, window.rodAnchor.y, bobberX, bobberScreenY);
      drawBobber(bobberX, bobberScreenY);

      if (window.state === window.GameState.Fishing) {
        for (const fish of window.world.fishes) {
          if (!fish || fish.finished) continue;
          const fishDistPx = (fish.position?.y ?? fish.distance) * metrics.pxPerMeter;
          const fishWorldY = metrics.waterSurfaceY - fishDistPx;
          const fishScreenY = fishWorldY + window.camera.y;
          const fishScreenX = W * 0.5 + (fish.position?.x ?? 0) * (W * 0.008);
          if (fishScreenY < -50 || fishScreenY > H + 50 || fishScreenX < -50 || fishScreenX > W + 50) {
            continue;
          }
          const fishImage = window.gameData.resources.fish.get(fish.specId);
          if (fishImage) {
            const fishScale = 0.8;
            const fishW = fishImage.width * fishScale;
            const fishH = fishImage.height * fishScale;
            window.ctx.drawImage(fishImage, fishScreenX - fishW / 2, fishScreenY - fishH / 2, fishW, fishH);
          } else {
            const fishSize = 12;
            window.ctx.fillStyle = fish.iconColor;
            window.ctx.beginPath();
            window.ctx.ellipse(fishScreenX, fishScreenY, fishSize, fishSize * 0.6, 0, 0, Math.PI * 2);
            window.ctx.fill();
            window.ctx.beginPath();
            window.ctx.moveTo(fishScreenX - fishSize, fishScreenY);
            window.ctx.lineTo(fishScreenX - fishSize - 8, fishScreenY - 6);
            window.ctx.lineTo(fishScreenX - fishSize - 8, fishScreenY + 6);
            window.ctx.closePath();
            window.ctx.fill();
            window.ctx.fillStyle = `${fish.iconColor}80`;
            window.ctx.beginPath();
            window.ctx.ellipse(fishScreenX + 2, fishScreenY - 8, 4, 3, 0, 0, Math.PI * 2);
            window.ctx.fill();
            window.ctx.fillStyle = '#ffffff';
            window.ctx.beginPath();
            window.ctx.arc(fishScreenX + 4, fishScreenY - 2, 2, 0, Math.PI * 2);
            window.ctx.fill();
            window.ctx.fillStyle = '#000000';
            window.ctx.beginPath();
            window.ctx.arc(fishScreenX + 4, fishScreenY - 2, 1, 0, Math.PI * 2);
            window.ctx.fill();
          }
          if (fish.engaged) {
            window.ctx.strokeStyle = fish.iconColor;
            window.ctx.lineWidth = 2;
            window.ctx.setLineDash([5, 5]);
            window.ctx.beginPath();
            window.ctx.arc(fishScreenX, fishScreenY, 15, 0, Math.PI * 2);
            window.ctx.stroke();
            window.ctx.setLineDash([]);
          }
        }

        updateActiveCircles(1 / 60, bobberX, bobberScreenY, metrics, window.camera.y);
        updateMinimap();
      }

      if (window.state === window.GameState.Flight) {
        const progress = Math.min(window.world.time / 1.5, 1);
        window.world.bobberDist = window.lerp(0, window.world.castDistance, progress);
        if (progress >= 1) {
          startFishing();
        }
      }
    }

    if (window.state === window.GameState.Flight || window.state === window.GameState.Fishing) {
      window.distanceEl.textContent = `Distance: ${Math.round(window.world.bobberDist)}m`;
    }
  }

  function gameLoop(currentTime) {
    if (typeof gameLoop.lastTime !== 'number') {
      gameLoop.lastTime = currentTime;
    }
    const dt = Math.min((currentTime - gameLoop.lastTime) / 1000, 1 / 30);
    gameLoop.lastTime = currentTime;
    window.globalTime += dt;
    window.world.time += dt;

    updateCharacterAnimation(dt);
    updateFishSimulation(dt);

    if (window.state === window.GameState.Flight || window.state === window.GameState.Fishing) {
      const metrics = getEnvironmentMetrics(window.canvas.width, window.canvas.height);
      updateCamera(window.world.bobberDist, metrics, dt, window.state);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  function setupEventListeners() {
    window.startBtn.addEventListener('click', async () => {
      if (!window.dataLoaded || !window.assetsReady) {
        window.startBtn.textContent = 'Loading Assets...';
        window.startBtn.classList.add('disabled');
        const success = await loadGameData();
        if (success) {
          window.startBtn.textContent = 'Touch to Start';
          window.startBtn.classList.remove('disabled', 'error');
        } else {
          window.startBtn.textContent = 'Failed to Load - Retry';
          window.startBtn.classList.add('error');
        }
        return;
      }
      if (window.state !== window.GameState.Idle) return;
      if (window.settings.energy <= 0) {
        window.toast('Not enough energy.');
        return;
      }
      startCasting();
    });

    window.canvas.addEventListener('click', () => {
      if (window.state === window.GameState.Idle && window.dataLoaded && window.assetsReady) {
        if (window.settings.energy <= 0) {
          window.toast('Not enough energy.');
          return;
        }
        startCasting();
      }
    });

    window.addEventListener('pointerdown', () => {
      if (window.state === window.GameState.Fishing) {
        const anyActive = window.world.actives.length > 0;
        const caughtNow = [];
        for (const a of window.world.actives) {
          if (rollCatch(a)) caughtNow.push(a.fish);
        }
        if (caughtNow.length) {
          for (const f of caughtNow) {
            if (f.active) releaseActiveCircle(f.active, false);
            f.finished = true;
            f.engaged = false;
            window.world.catches.push(f);
          }
          showResults();
        } else if (anyActive) {
          window.showMissEffect();
        }
      }
    });

    window.rNext.addEventListener('click', () => {
      window.resultsIndex++;
      if (window.resultsIndex < window.world.catches.length) {
        renderResultCard();
      } else {
        window.results.style.display = 'none';
        window.state = window.GameState.Idle;
        window.title.style.display = 'flex';
        resetCharacterToIdle();
        window.setGameplayLayout(false);
      }
    });

    window.rSkip.addEventListener('click', () => {
      window.results.style.display = 'none';
      window.state = window.GameState.Idle;
      window.title.style.display = 'flex';
      resetCharacterToIdle();
      window.setGameplayLayout(false);
    });
  }

  async function initGame() {
    ensureDomReferences();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.state = window.GameState.Idle;
    window.resultsIndex = 0;
    window.setGameplayLayout(false);
    window.setHUD();

    const success = await loadGameData();
    if (success) {
      window.startBtn.textContent = 'Touch to Start';
      window.startBtn.classList.remove('disabled');
      window.setHUD();
    }

    setupEventListeners();
    requestAnimationFrame(gameLoop);
    setInterval(() => {
      if (window.settings.energy < 10) {
        window.settings.energy++;
        window.setHUD();
      }
    }, 30000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initGame().catch(err => console.error(err));
  });
})();

