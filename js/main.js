// Main game bootstrap and high-level orchestration logic.
// Relies on global state defined in state.js and helpers from utils.js.

(function () {
  function ensureDomReferences() {
    window.canvas = document.getElementById('view');
    window.ctx = window.canvas?.getContext('2d') ?? null;
    window.startBtn = document.getElementById('startBtn');
    window.title = document.getElementById('title');
    window.castPrompt = document.getElementById('castPrompt');
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
        window.startBtn.textContent = 'Game Play';
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

  const TARGET_MIN_DISTANCE = 30;
  const TARGET_MAX_DISTANCE = 150;
  const TARGET_SPEED_BASE = 220;
  const WORLD_HALF_WIDTH = 5;

  function setCastPrompt(visible) {
    if (!window.castPrompt) return;
    window.castPrompt.classList.toggle('show', !!visible);
  }

  function resetTargetCircle() {
    window.world.targetCircle = {
      distance: TARGET_MIN_DISTANCE,
      velocity: 0,
      holding: false,
      holdTime: 0,
      reachedTop: false
    };
    window.world.bobberDist = TARGET_MIN_DISTANCE;
    window.world.castDistance = TARGET_MIN_DISTANCE;
  }

  function updateDistanceReadout() {
    if (!window.distanceEl) return;
    window.distanceEl.textContent = `Distance: ${Math.round(window.world.bobberDist)}m`;
  }

  function startPlaySession() {
    window.setGameplayLayout(true);
    window.camera.y = 0;
    window.settings.energy = Math.max(0, window.settings.energy - 1);
    window.setHUD();
    window.title.style.display = 'none';
    window.state = window.GameState.Targeting;
    window.world.actives = [];
    window.world.catches = [];
    window.world.time = 0;
    window.world.targetZoom = 1;
    window.world.viewZoom = 1;
    resetTargetCircle();
    updateDistanceReadout();
    if (window.minimap) window.minimap.style.display = 'block';
    const metrics = getEnvironmentMetrics(window.canvas.clientWidth, window.canvas.clientHeight);
    const spawnInfo = spawnFishes(window.settings.maxCast, { spread: true, halfWidth: WORLD_HALF_WIDTH });
    window.world.fishes = spawnInfo.fishes;
    window.world.lateralLimit = spawnInfo.lateralLimit;
    window.world.displayRange = spawnInfo.displayRange;
    setCastPrompt(true);
  }

  function updateTargeting(dt) {
    const target = window.world.targetCircle;
    if (!target) return;
    if (target.holding) {
      target.holdTime += dt;
      const desiredSpeed = Math.min(TARGET_SPEED_BASE * (1 + target.holdTime * 0.8), TARGET_SPEED_BASE * 2.2);
      target.velocity += (desiredSpeed - target.velocity) * (1 - Math.pow(0.001, dt * 9));
      target.distance += target.velocity * dt;
      if (target.distance >= TARGET_MAX_DISTANCE) {
        target.distance = TARGET_MAX_DISTANCE;
        target.reachedTop = true;
      }
      window.world.targetZoom = 1.28;
    } else {
      target.velocity += (0 - target.velocity) * (1 - Math.pow(0.001, dt * 12));
      window.world.targetZoom = 1;
    }
    target.distance = window.clamp(target.distance, TARGET_MIN_DISTANCE, TARGET_MAX_DISTANCE);
    window.world.bobberDist = target.distance;
    window.world.castDistance = target.distance;
    updateDistanceReadout();
  }

  function handlePointerDown() {
    if (window.state !== window.GameState.Targeting) return;
    const target = window.world.targetCircle;
    if (!target) return;
    target.holding = true;
    target.holdTime = 0;
    target.velocity = 0;
    target.reachedTop = false;
    setCastPrompt(false);
    startCharacterCastAnimation();
  }

  function attemptCatch() {
    const actives = Array.isArray(window.world.actives) ? window.world.actives.slice() : [];
    const anyActive = actives.some(a => a && a.fish && !a.fish.finished);
    const caughtNow = [];
    for (const active of actives) {
      if (!active || !active.fish) continue;
      if (rollCatch(active)) {
        const fish = active.fish;
        fish.finished = true;
        fish.engaged = false;
        if (fish.active) fish.active = null;
        caughtNow.push(fish);
        window.world.catches.push(fish);
      }
      releaseActiveCircle(active, false);
    }
    window.world.actives = [];
    if (caughtNow.length) {
      showResults();
    } else {
      window.showMissEffect();
      if (!anyActive) {
        window.toast('Miss – no fish bit the bobber.');
      }
      window.world.targetCircle = null;
      if (window.minimap) window.minimap.style.display = 'none';
      if (window.distanceEl) window.distanceEl.style.display = 'none';
      setCastPrompt(false);
      resetToIdle();
    }
  }

  function handlePointerUp() {
    if (window.state !== window.GameState.Targeting) return;
    const target = window.world.targetCircle;
    if (!target || !target.holding) return;
    target.holding = false;
    target.velocity = 0;
    window.world.targetZoom = 1;
    attemptCatch();
  }

  function resetToIdle() {
    window.state = window.GameState.Idle;
    window.title.style.display = 'flex';
    setCastPrompt(false);
    window.world.targetCircle = null;
    window.world.actives = [];
    window.world.catches = [];
    window.world.targetZoom = 1;
    window.world.viewZoom = 1;
    window.world.bobberDist = TARGET_MIN_DISTANCE;
    window.world.castDistance = TARGET_MIN_DISTANCE;
    window.resultsIndex = 0;
    if (window.minimap) window.minimap.style.display = 'none';
    resetCharacterToIdle();
    window.setGameplayLayout(false);
    updateDistanceReadout();
  }

  function showResults() {
    window.state = window.GameState.Results;
    window.resultsIndex = 0;
    window.results.style.display = 'flex';
    if (window.minimap) window.minimap.style.display = 'none';
    if (window.distanceEl) window.distanceEl.style.display = 'none';
    window.world.targetCircle = null;
    setCastPrompt(false);
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

  function drawTargetCircle(x, y) {
    const pulse = 1 + Math.sin(window.globalTime * 4) * 0.08;
    const radius = 30 * pulse;
    window.ctx.save();
    window.ctx.lineWidth = 3;
    window.ctx.strokeStyle = '#6fffe9';
    window.ctx.globalAlpha = 0.9;
    window.ctx.beginPath();
    window.ctx.arc(x, y, radius, 0, Math.PI * 2);
    window.ctx.stroke();
    window.ctx.globalAlpha = 0.25;
    window.ctx.fillStyle = '#0ea5e980';
    window.ctx.beginPath();
    window.ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
    window.ctx.fill();
    window.ctx.restore();
  }

  function updateMinimap() {
    if (!window.mmbar) return;
    window.mmbar.innerHTML = '<div class="mmcenter"></div>';
    if (window.state !== window.GameState.Targeting) return;

    const mapWidth = 120;
    const mapHeight = 60;
    const lateralRange = Math.max(1, window.world.displayRange || window.world.lateralLimit || WORLD_HALF_WIDTH);

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
        dot.style.width = fish.engaged ? '6px' : '4px';
        dot.style.height = fish.engaged ? '6px' : '4px';
        dot.style.backgroundColor = fish.iconColor;
        dot.style.borderRadius = '50%';
        dot.style.left = (mapWidth * 0.5 + (fishX / lateralRange) * mapWidth * 0.45) + 'px';
        dot.style.top = (mapHeight * 0.5 + (dy / window.DETECTION_RANGE_M) * mapHeight * 0.45) + 'px';
        dot.style.transform = 'translate(-50%, -50%)';
        if (fish.engaged) {
          dot.style.border = '1px solid white';
        }
        window.mmbar.appendChild(dot);
      }
    }

    const rangeCircle = document.createElement('div');
    rangeCircle.style.position = 'absolute';
    rangeCircle.style.left = '50%';
    rangeCircle.style.top = '50%';
    rangeCircle.style.transform = 'translate(-50%, -50%)';
    const baseSize = Math.min(mapWidth, mapHeight) * 0.9;
    const circleSize = baseSize * Math.min(1, window.DETECTION_RANGE_M / lateralRange);
    rangeCircle.style.width = circleSize + 'px';
    rangeCircle.style.height = circleSize + 'px';
    rangeCircle.style.border = '1px solid rgba(91, 192, 190, 0.5)';
    rangeCircle.style.borderRadius = '50%';
    rangeCircle.style.pointerEvents = 'none';
    window.mmbar.appendChild(rangeCircle);
  }

  function render() {
    if (!window.canvas || !window.ctx) return;

    const W = window.canvas.width;
    const H = window.canvas.height;
    const metrics = getEnvironmentMetrics(W, H);
    const distancePx = window.world.bobberDist * metrics.pxPerMeter;
    const bobberWorldY = metrics.waterSurfaceY - distancePx;
    const bobberScreenY = bobberWorldY + window.camera.y;
    const bobberX = W * 0.5 + metrics.bobberOffsetX;
    const lateralScale = (W * 0.82) / (Math.max(1, window.world.lateralLimit || WORLD_HALF_WIDTH) * 2);

    window.ctx.clearRect(0, 0, W, H);

    window.ctx.save();
    const zoom = window.state === window.GameState.Targeting ? (window.world.viewZoom || 1) : 1;
    if (Math.abs(zoom - 1) > 0.01) {
      window.ctx.translate(W / 2, bobberScreenY);
      window.ctx.scale(zoom, zoom);
      window.ctx.translate(-W / 2, -bobberScreenY);
    }

    drawEnvironment(W, H, metrics, window.camera.y);
    if (window.state === window.GameState.Idle) {
      drawPassingSchool(W, H);
    }
    drawCharacterSprite(W, H, metrics, window.camera.y);

    if (window.state === window.GameState.Targeting) {
      const hasTarget = !!window.world.targetCircle;
      if (hasTarget) {
        drawFishingLine(window.rodAnchor.x, window.rodAnchor.y, bobberX, bobberScreenY);
        drawTargetCircle(bobberX, bobberScreenY);
        drawBobber(bobberX, bobberScreenY);
      }

      for (const fish of window.world.fishes) {
        if (!fish || fish.finished) continue;
        const fishDistPx = (fish.position?.y ?? fish.distance) * metrics.pxPerMeter;
        const fishWorldY = metrics.waterSurfaceY - fishDistPx;
        const fishScreenY = fishWorldY + window.camera.y;
        const fishScreenX = W * 0.5 + (fish.position?.x ?? 0) * lateralScale;
        if (fishScreenY < -80 || fishScreenY > H + 80 || fishScreenX < -80 || fishScreenX > W + 80) {
          continue;
        }
        const fishImage = window.gameData.resources.fish.get(fish.specId);
        if (fishImage) {
          const fishScale = 0.75;
          const fishW = fishImage.width * fishScale;
          const fishH = fishImage.height * fishScale;
          window.ctx.drawImage(fishImage, fishScreenX - fishW / 2, fishScreenY - fishH / 2, fishW, fishH);
        } else {
          const fishSize = 10;
          window.ctx.fillStyle = fish.iconColor;
          window.ctx.beginPath();
          window.ctx.ellipse(fishScreenX, fishScreenY, fishSize, fishSize * 0.6, 0, 0, Math.PI * 2);
          window.ctx.fill();
          window.ctx.fillStyle = `${fish.iconColor}80`;
          window.ctx.beginPath();
          window.ctx.arc(fishScreenX + 2, fishScreenY - 4, 3, 0, Math.PI * 2);
          window.ctx.fill();
        }
        if (fish.engaged) {
          window.ctx.strokeStyle = fish.iconColor;
          window.ctx.lineWidth = 2;
          window.ctx.setLineDash([4, 6]);
          window.ctx.beginPath();
          window.ctx.arc(fishScreenX, fishScreenY, 14, 0, Math.PI * 2);
          window.ctx.stroke();
          window.ctx.setLineDash([]);
        }
      }

      if (hasTarget) {
        const dt = window.world.lastFrameDt ?? 1 / 60;
        updateActiveCircles(dt, bobberX, bobberScreenY, metrics, window.camera.y);
      }
    }

    window.ctx.restore();

    if (window.state === window.GameState.Targeting) {
      updateDistanceReadout();
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
    window.world.lastFrameDt = dt;

    updateCharacterAnimation(dt);
    updateFishSimulation(dt);

    const metrics = getEnvironmentMetrics(window.canvas.width, window.canvas.height);
    if (window.state === window.GameState.Targeting) {
      updateTargeting(dt);
    }
    updateCamera(window.world.bobberDist, metrics, dt, window.state);

    const zoomSmooth = 1 - Math.pow(0.001, dt * 6);
    const targetZoom = window.state === window.GameState.Targeting ? (window.world.targetZoom || 1) : 1;
    window.world.viewZoom += (targetZoom - window.world.viewZoom) * zoomSmooth;
    if (!Number.isFinite(window.world.viewZoom)) window.world.viewZoom = 1;

    render();
    if (window.state === window.GameState.Targeting) {
      updateMinimap();
    } else if (window.mmbar) {
      window.mmbar.innerHTML = '<div class="mmcenter"></div>';
    }
    requestAnimationFrame(gameLoop);
  }

  function setupEventListeners() {
    window.startBtn.addEventListener('click', async () => {
      if (!window.dataLoaded || !window.assetsReady) {
        window.startBtn.textContent = 'Loading Assets...';
        window.startBtn.classList.add('disabled');
        const success = await loadGameData();
        if (success) {
          window.startBtn.textContent = 'Game Play';
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
      startPlaySession();
    });

    window.canvas.addEventListener('click', () => {
      if (window.state === window.GameState.Idle && window.dataLoaded && window.assetsReady) {
        if (window.settings.energy <= 0) {
          window.toast('Not enough energy.');
          return;
        }
        startPlaySession();
      }
    });

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    window.rNext.addEventListener('click', () => {
      window.resultsIndex++;
      if (window.resultsIndex < window.world.catches.length) {
        renderResultCard();
      } else {
        window.results.style.display = 'none';
        resetToIdle();
      }
    });

    window.rSkip.addEventListener('click', () => {
      window.results.style.display = 'none';
      resetToIdle();
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
      window.startBtn.textContent = 'Game Play';
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

