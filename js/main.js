// Main game bootstrap and high-level orchestration logic.
// Relies on global state defined in state.js and helpers from utils.js.

(function () {
  const reelBattle = {
    modal: null,
    white: null,
    marker: null,
    fishImage: null,
    status: null,
    info: null,
    nextBtn: null,
    summaryModal: null,
    summaryList: null,
    summaryTotal: null,
    summaryClose: null,
    nextCountdownLabel: null,
    summaryCountdownLabel: null,
    queue: [],
    index: -1,
    results: [],
    state: null,
    totalPoints: 0,
    redWidth: 0.22,
    finalWhite: 0.22,
    duration: 2.6,
    autoAdvanceTimer: 0,
    autoAdvanceActive: false,
    summaryCountdownTimer: 0,
    summaryCountdownActive: false
  };

  function ensureDomReferences() {
    window.canvas = document.getElementById('view');
    window.ctx = window.canvas?.getContext('2d') ?? null;
    window.startBtn = document.getElementById('startBtn');
    window.mainMenu = document.getElementById('mainMenu');
    window.titleBar = document.getElementById('titleBar');
    window.navBar = document.getElementById('navBar');
    window.exitBtn = document.getElementById('exitBtn');
    window.autoBtn = document.getElementById('autoBtn');
    window.shopBtn = document.getElementById('shopBtn');
    window.rankBtn = document.getElementById('rankBtn');
    window.premiumBtn = document.getElementById('premiumBtn');
    window.castPrompt = document.getElementById('castPrompt');
    window.toastEl = document.getElementById('toast');
    window.missEffect = document.getElementById('missEffect');
    window.distanceEl = document.getElementById('distance');
    window.minimap = document.getElementById('minimap');
    window.mmbar = document.getElementById('mmbar');
    window.mmCells = document.getElementById('mmcells');
    window.mmViewport = document.getElementById('mmviewport');
    window.mmIndicator = document.getElementById('mmbobber');
    window.results = document.getElementById('results');
    window.rTitle = document.getElementById('rTitle');
    window.rBody = document.getElementById('rBody');
    window.rNext = document.getElementById('rNext');
    window.rSkip = document.getElementById('rSkip');
    window.energyEl = document.getElementById('energy');
    window.pointsEl = document.getElementById('points');
    reelBattle.modal = document.getElementById('reelBattleModal');
    reelBattle.white = document.getElementById('battleGaugeWhite');
    reelBattle.marker = document.getElementById('battleGaugeFish');
    reelBattle.fishImage = document.getElementById('battleFishImage');
    reelBattle.status = document.getElementById('battleStatus');
    reelBattle.info = document.getElementById('battleInfo');
    reelBattle.nextBtn = document.getElementById('battleNext');
    reelBattle.summaryModal = document.getElementById('catchSummary');
    reelBattle.summaryList = document.getElementById('summaryList');
    reelBattle.summaryTotal = document.getElementById('summaryTotal');
    reelBattle.summaryClose = document.getElementById('summaryClose');
    reelBattle.nextCountdownLabel = document.getElementById('battleNextCountdown');
    reelBattle.summaryCountdownLabel = document.getElementById('summaryCountdown');
    updateAutoButtonUI();

    if (!window.canvas || !window.ctx || !window.startBtn || !window.mainMenu) {
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
    queue('assets/characters/wood.png', img => { window.environmentState.dock = img; });
    if (window.characterSprite.spriteSource) {
      queue(window.characterSprite.spriteSource, img => { window.characterSprite.image = img; });
    }
    queue('assets/characters/waterwave.png', img => {
      window.waveEffect.image = img;
      if (img && img.width && img.height) {
        const cols = Math.max(1, Math.floor(window.waveEffect.sheetColumns || 1));
        const rows = Math.max(1, Math.floor(window.waveEffect.sheetRows || Math.ceil(window.waveEffect.frameCount / cols)));
        window.waveEffect.frameWidth = Math.floor(img.width / cols);
        window.waveEffect.frameHeight = Math.floor(img.height / rows);
      }
    });

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
      const lane = (i + Math.random() * 0.8 + 0.2) / (count + 0.4);
      const baseX = Math.min(0.95, Math.max(0.05, lane));
      const baseY = 0.18 + Math.random() * 0.64;
      const xDrift = 0.08 + Math.random() * 0.25;
      const yDrift = 0.08 + Math.random() * 0.22;
      return {
        id,
        img,
        scale: 0.55 + Math.random() * 0.45,
        baseX,
        baseY,
        xAmp: xDrift,
        yAmp: yDrift,
        xSpeed: 0.35 + Math.random() * 0.85,
        ySpeed: 0.3 + Math.random() * 0.65,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2
      };
    });
  }

  function drawPassingSchool(W, H, metrics) {
    if (!window.passingSchool.length || !window.ctx) return;
    const time = window.globalTime;
    const waterTop = Math.max(20, (metrics?.topMargin || H * 0.2) * 0.45);
    const waterBottom = Math.max(waterTop + 80, (metrics?.shorelineY ?? H * 0.8) - (metrics?.tileH ?? 40) * 0.5);
    const waterHeight = waterBottom - waterTop;
    const lateralMargin = W * 0.08;
    const usableWidth = Math.max(40, W - lateralMargin * 2);
    for (const fish of window.passingSchool) {
      const sinX = Math.sin(time * fish.xSpeed + fish.phaseX);
      const sinY = Math.sin(time * fish.ySpeed + fish.phaseY);
      const centerX = lateralMargin + usableWidth * (fish.baseX ?? 0.5);
      const offsetX = sinX * (fish.xAmp ?? 0.1) * usableWidth * 0.5;
      const x = centerX + offsetX;
      const centerY = waterTop + waterHeight * (fish.baseY ?? 0.5);
      const offsetY = sinY * (fish.yAmp ?? 0.1) * waterHeight * 0.5;
      const y = centerY + offsetY;
      const img = fish.img;
      if (!img) continue;
      const scale = fish.scale * 0.7;
      const width = img.width * scale;
      const height = img.height * scale;
      const dir = Math.cos(time * fish.xSpeed + fish.phaseX) * fish.xSpeed;
      const facingRight = dir > 0;
      window.ctx.save();
      window.ctx.globalAlpha = 0.55;
      window.ctx.translate(x, y);
      if (facingRight) window.ctx.scale(-1, 1);
      window.ctx.drawImage(img, -width / 2, -height / 2, width, height);
      window.ctx.restore();
    }
  }

  const TARGET_MIN_DISTANCE = window.MIN_CAST_DISTANCE ?? 30;
  const TARGET_MAX_DISTANCE = 150;
  const TARGET_SPEED_BASE = 22;
  const SINK_DURATION = 3;
  const SINK_DISTANCE_DROP = 12;
  const SINK_MIN_DISTANCE = window.MIN_SINK_DISTANCE ?? TARGET_MIN_DISTANCE * 0.8;
  const WORLD_HALF_WIDTH = 5;

  function setCastPrompt(visible, message) {
    if (!window.castPrompt) return;
    if (typeof message === 'string') {
      window.castPrompt.textContent = message;
    }
    window.castPrompt.classList.toggle('show', !!visible);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setModalVisibility(element, visible) {
    if (!element) return;
    element.style.display = visible ? 'flex' : 'none';
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function clearNextBattleCountdown() {
    reelBattle.autoAdvanceActive = false;
    reelBattle.autoAdvanceTimer = 0;
    if (reelBattle.nextCountdownLabel) {
      reelBattle.nextCountdownLabel.textContent = '';
      reelBattle.nextCountdownLabel.classList.remove('show');
    }
  }

  function startNextBattleCountdown() {
    reelBattle.autoAdvanceTimer = 2;
    reelBattle.autoAdvanceActive = true;
    if (reelBattle.nextCountdownLabel) {
      reelBattle.nextCountdownLabel.textContent = '2.0s';
      reelBattle.nextCountdownLabel.classList.add('show');
    }
  }

  function clearSummaryCountdown() {
    reelBattle.summaryCountdownActive = false;
    reelBattle.summaryCountdownTimer = 0;
    if (reelBattle.summaryCountdownLabel) {
      reelBattle.summaryCountdownLabel.textContent = '';
      reelBattle.summaryCountdownLabel.classList.remove('show');
    }
  }

  function startSummaryCountdown() {
    reelBattle.summaryCountdownTimer = 2;
    reelBattle.summaryCountdownActive = true;
    if (reelBattle.summaryCountdownLabel) {
      reelBattle.summaryCountdownLabel.textContent = '2.0s';
      reelBattle.summaryCountdownLabel.classList.add('show');
    }
  }

  function updateAutoButtonUI() {
    if (!window.autoBtn) return;
    const active = !!window.world.autoMode;
    window.autoBtn.classList.toggle('active', active);
    window.autoBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    window.autoBtn.textContent = active ? 'Auto On' : 'Auto';
  }

  function computeAutoTargetDistance() {
    const min = TARGET_MIN_DISTANCE;
    const max = TARGET_MAX_DISTANCE;
    const fishes = window.world.fishes;
    if (!Array.isArray(fishes) || !fishes.length) {
      return window.rand(min + 4, max - 6);
    }

    const bucketSize = 8;
    const rarityPriority = window.RARITY_PRIORITY || {};
    const buckets = new Map();

    for (const fish of fishes) {
      if (!fish || fish.finished) continue;
      const distRaw = fish.position?.y ?? fish.distance ?? min;
      const dist = window.clamp(distRaw, min, max);
      const bucketIndex = Math.max(0, Math.floor((dist - min) / bucketSize));
      const rarity = fish.spec?.rarity || 'Common';
      const priority = rarityPriority[rarity] ?? 0;
      const weight = 1 + priority * 0.25 + Math.min(1.2, Math.max(0, (fish.schoolSize ?? 1) * 0.12));
      buckets.set(bucketIndex, (buckets.get(bucketIndex) || 0) + weight);
    }

    if (!buckets.size) {
      return window.rand(min + 4, max - 6);
    }

    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
    const topScore = sorted[0][1];
    const viable = sorted.filter(([, score]) => score >= topScore * 0.55);
    const pool = viable.length ? viable : sorted;
    const total = pool.reduce((sum, [, score]) => sum + score, 0);
    let pickRoll = Math.random() * (total || 1);
    let chosen = pool[0];
    for (const entry of pool) {
      pickRoll -= entry[1];
      if (pickRoll <= 0) {
        chosen = entry;
        break;
      }
    }

    const bucketIndex = chosen?.[0] ?? 0;
    const bucketStart = min + bucketIndex * bucketSize;
    const bucketEnd = Math.min(max, bucketStart + bucketSize);
    const span = Math.max(1.5, bucketEnd - bucketStart);
    const innerStart = window.clamp(bucketStart + span * 0.2, min, max);
    const innerEnd = window.clamp(bucketEnd - span * 0.2, min, max);
    const base = innerEnd > innerStart ? window.rand(innerStart, innerEnd) : (bucketStart + bucketEnd) / 2;
    const jitter = window.rand(-Math.min(2.2, span * 0.25), Math.min(2.2, span * 0.25));
    let target = base + jitter;
    if (Math.random() < 0.12) {
      target = window.rand(min + 6, max - 6);
    }
    return window.clamp(target, min + 1, max - 1);
  }

  function computeAutoReleaseDelay(distance) {
    const min = TARGET_MIN_DISTANCE;
    const max = TARGET_MAX_DISTANCE;
    const range = Math.max(1, max - min);
    const ratio = window.clamp((distance - min) / range, 0, 1);
    const base = 0.85 + ratio * 1.25;
    return window.clamp(base + window.rand(-0.05, 0.22), 0.75, 2.6);
  }

  function scheduleAutoCast(delay = 0.45) {
    if (!window.world.autoMode) return;
    if (window.state !== window.GameState.Targeting) return;
    if (window.world.castStage !== 'aiming') return;
    const target = window.world.targetCircle;
    if (!target) return;
    window.world.autoCastTimer = Math.max(0, delay);
    window.world.autoHoldActive = false;
    const desiredDistance = computeAutoTargetDistance();
    window.world.autoTargetDistance = desiredDistance;
    window.world.autoReleaseDelay = computeAutoReleaseDelay(desiredDistance);
    target.holding = false;
    target.holdTime = 0;
    target.velocity = 0;
    target.reachedTop = false;
    setCastPrompt(true, 'Auto casting...');
  }

  function setAutoMode(enabled, schedule = true) {
    const next = !!enabled;
    if (window.world.autoMode === next) {
      if (next && schedule) scheduleAutoCast(window.rand(0.3, 0.6));
      updateAutoButtonUI();
      return;
    }
    window.world.autoMode = next;
    window.world.autoHoldActive = false;
    if (!next) {
      window.world.autoCastTimer = 0;
      window.world.autoReleaseDelay = 0;
      window.world.autoTargetDistance = null;
      if (window.world.targetCircle) {
        window.world.targetCircle.holding = false;
      }
      if (window.state === window.GameState.Targeting && window.world.castStage === 'aiming') {
        setCastPrompt(true, 'Press the Screen to cast the bobber');
      }
    } else if (schedule) {
      scheduleAutoCast(window.rand(0.3, 0.6));
    }
    updateAutoButtonUI();
  }

  function updateAutoPlay(dt) {
    if (!window.world.autoMode) return;
    if (window.state !== window.GameState.Targeting) return;
    const stage = window.world.castStage;
    if (stage === 'aiming') {
      const target = window.world.targetCircle;
      if (!target) return;
      if (!window.world.autoHoldActive) {
        window.world.autoCastTimer -= dt;
        if (window.world.autoCastTimer <= 0) {
          if (!target.holding) {
            handlePointerDown();
          }
          if (target.holding) {
            window.world.autoHoldActive = true;
            if (!Number.isFinite(window.world.autoTargetDistance)) {
              const desired = computeAutoTargetDistance();
              window.world.autoTargetDistance = desired;
              window.world.autoReleaseDelay = computeAutoReleaseDelay(desired);
            } else if (!Number.isFinite(window.world.autoReleaseDelay) || window.world.autoReleaseDelay <= 0) {
              window.world.autoReleaseDelay = computeAutoReleaseDelay(window.world.autoTargetDistance);
            }
          }
        }
      } else if (target.holding) {
        if (!Number.isFinite(window.world.autoTargetDistance)) {
          window.world.autoTargetDistance = computeAutoTargetDistance();
        }
        if (!Number.isFinite(window.world.autoReleaseDelay) || window.world.autoReleaseDelay <= 0) {
          window.world.autoReleaseDelay = computeAutoReleaseDelay(window.world.autoTargetDistance);
        }
        const desiredDistance = window.world.autoTargetDistance ?? TARGET_MAX_DISTANCE - 3;
        const tolerance = 1.5 + Math.abs(target.velocity || 0) * 0.04;
        if (
          target.distance >= desiredDistance - tolerance ||
          target.reachedTop ||
          target.holdTime >= window.world.autoReleaseDelay
        ) {
          handlePointerUp();
          window.world.autoHoldActive = false;
        }
      } else {
        window.world.autoHoldActive = false;
      }
    } else if (stage !== 'sinking') {
      window.world.autoHoldActive = false;
    }
  }

  function resetReelBattle(hideModals = true) {
    reelBattle.queue = [];
    reelBattle.index = -1;
    reelBattle.results = [];
    reelBattle.state = null;
    reelBattle.totalPoints = 0;
    clearNextBattleCountdown();
    clearSummaryCountdown();
    window.world.battleQueue = [];
    window.world.battleResults = [];
    window.world.currentBattleIndex = -1;
    window.world.pendingPointTotal = 0;
    window.world.autoTargetDistance = null;
    if (hideModals) {
      setModalVisibility(reelBattle.modal, false);
      setModalVisibility(reelBattle.summaryModal, false);
    }
    if (reelBattle.status) {
      reelBattle.status.textContent = '';
      reelBattle.status.classList.remove('success', 'fail');
    }
    if (reelBattle.info) {
      reelBattle.info.textContent = '';
    }
    if (reelBattle.fishImage) {
      reelBattle.fishImage.innerHTML = '';
      reelBattle.fishImage.classList.remove('celebrate', 'flip');
      reelBattle.fishImage.style.transform = '';
    }
    if (reelBattle.white) {
      reelBattle.white.style.left = '0%';
      reelBattle.white.style.width = '100%';
    }
    if (reelBattle.marker) {
      reelBattle.marker.style.left = '50%';
    }
    if (reelBattle.nextBtn) {
      reelBattle.nextBtn.disabled = true;
      reelBattle.nextBtn.classList.add('disabled');
    }
  }

  function renderBattleFishArt(fish) {
    if (!reelBattle.fishImage) return;
    const container = reelBattle.fishImage;
    container.innerHTML = '';
    container.classList.remove('celebrate', 'flip');
    container.style.transform = 'translate(-50%, -50%)';
    if (!fish) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      container.appendChild(placeholder);
      return;
    }
    const images = fish.spec?.images || {};
    const cache = window.gameData?.resources?.fish;
    const cachedImg = fish.image || cache?.get?.(fish.specId) || null;
    const src = cachedImg?.src || images.card || images.illustration || images.sprite || '';
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${fish.spec?.displayName || 'Fish'} illustration`;
      container.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      container.appendChild(placeholder);
    }
  }

  function gatherFishCandidates(range) {
    const fishes = [];
    if (!Array.isArray(window.world.fishes)) return fishes;
    for (const fish of window.world.fishes) {
      if (!fish || fish.finished) continue;
      const x = fish.position?.x ?? 0;
      const y = fish.position?.y ?? fish.distance ?? window.world.bobberDist;
      const dy = y - window.world.bobberDist;
      const dist = Math.sqrt(x * x + dy * dy);
      if (!Number.isFinite(dist)) continue;
      if (dist <= range) {
        fishes.push({ fish, dist });
      }
    }
    fishes.sort((a, b) => a.dist - b.dist);
    return fishes.map(entry => entry.fish);
  }

  function computeBattleChance(fish, candidateCount) {
    const spec = fish?.spec || {};
    let base = 0.55;
    const rarityAdjust = {
      Common: 0.12,
      Uncommon: 0.05,
      Rare: -0.02,
      Epic: -0.08,
      Legendary: -0.15,
      Mythic: -0.2
    }[spec.rarity] ?? 0;
    base += rarityAdjust;
    const stressFactor = window.clamp(1 - (fish?.stressLevel ?? 0) * 0.35, 0.7, 1.1);
    base *= stressFactor;
    const crowding = window.clamp(0.12 - (candidateCount - 1) * 0.04, -0.12, 0.18);
    base += crowding;
    if (fish?.bonusMultiplier > 1) {
      base += 0.04 * (fish.bonusMultiplier - 1);
    }
    return window.clamp(base, 0.1, 0.92);
  }

  function startReelBattleSequence(fishes) {
    if (!Array.isArray(fishes) || !fishes.length) return;
    window.state = window.GameState.Results;
    window.world.castStage = 'idle';
    window.world.bobberVisible = false;
    resetReelBattle(false);
    reelBattle.queue = fishes.map(fish => {
      const chance = computeBattleChance(fish, fishes.length);
      return {
        fish,
        chance,
        success: Math.random() < chance,
        resolved: false,
        points: 0
      };
    });
    reelBattle.index = -1;
    reelBattle.results = [];
    reelBattle.totalPoints = 0;
    reelBattle.state = null;
    window.world.battleQueue = reelBattle.queue.map(entry => entry.fish);
    window.world.battleResults = reelBattle.results;
    window.world.currentBattleIndex = -1;
    window.world.pendingPointTotal = 0;
    if (window.results) window.results.style.display = 'none';
    if (window.minimap) window.minimap.style.display = 'none';
    if (window.distanceEl) window.distanceEl.style.display = 'none';
    setCastPrompt(false);
    beginNextReelBattle();
  }

  function beginNextReelBattle() {
    clearNextBattleCountdown();
    reelBattle.index += 1;
    window.world.currentBattleIndex = reelBattle.index;
    if (reelBattle.index >= reelBattle.queue.length) {
      finishReelBattleSequence();
      return;
    }
    setupReelBattle(reelBattle.queue[reelBattle.index]);
  }

  function setupReelBattle(candidate) {
    if (!candidate || !candidate.fish) {
      beginNextReelBattle();
      return;
    }
    const fish = candidate.fish;
    if (reelBattle.status) {
      reelBattle.status.textContent = '줄을 잡아당기는 중...';
      reelBattle.status.classList.remove('success', 'fail');
    }
    if (reelBattle.info) {
      const name = fish.spec?.displayName || '알 수 없는 물고기';
      reelBattle.info.textContent = `${name}이(가) 버티고 있습니다.`;
    }
    renderBattleFishArt(fish);
    if (reelBattle.white) {
      reelBattle.white.style.left = '0%';
      reelBattle.white.style.width = '100%';
    }
    if (reelBattle.marker) {
      reelBattle.marker.style.left = '50%';
    }
    if (reelBattle.nextBtn) {
      reelBattle.nextBtn.disabled = true;
      reelBattle.nextBtn.classList.add('disabled');
      reelBattle.nextBtn.textContent = 'Next';
    }
    clearNextBattleCountdown();
    setModalVisibility(reelBattle.modal, true);
    reelBattle.state = {
      candidate,
      elapsed: 0,
      duration: reelBattle.duration,
      redWidth: reelBattle.redWidth,
      finalWhite: reelBattle.finalWhite,
      currentWidth: 1,
      fishPos: 0.5,
      fishDirection: -1,
      fishPhase: Math.random() * Math.PI * 2,
      fishSpeed: 4.2 + Math.random() * 2.2,
      success: candidate.success,
      resolved: false,
      failTriggered: false,
      failDirection: Math.random() > 0.5 ? 1 : -1
    };
  }

  function resolveReelBattleOutcome(success) {
    const state = reelBattle.state;
    if (!state || state.resolved) return;
    state.resolved = true;
    const candidate = state.candidate;
    candidate.resolved = true;
    candidate.outcome = success;
    const fish = candidate.fish;
    const name = fish.spec?.displayName || 'Mystery Fish';
    const rarity = fish.spec?.rarity || 'Unknown';
    fish.finished = true;
    if (reelBattle.status) {
      reelBattle.status.textContent = success ? '성공' : '실패';
      reelBattle.status.classList.toggle('success', success);
      reelBattle.status.classList.toggle('fail', !success);
    }
    let infoHtml = '';
    if (success) {
      if (reelBattle.fishImage) reelBattle.fishImage.classList.add('celebrate');
      const points = computePoints(fish, window.world.castDistance);
      candidate.points = points;
      reelBattle.totalPoints += points;
      window.world.pendingPointTotal = reelBattle.totalPoints;
      reelBattle.results.push({ fish, success: true, points });
      if (!window.world.catches.includes(fish)) {
        window.world.catches.push(fish);
      }
      infoHtml = `
        <p><strong>${escapeHtml(name)}</strong> (${escapeHtml(rarity)})</p>
        <p>Size: ${fish.size_cm.toFixed(1)} cm · Weight: ${fish.weight_kg.toFixed(2)} kg</p>
        <p><strong>Points +${points}</strong></p>
      `;
    } else {
      candidate.points = 0;
      reelBattle.results.push({ fish, success: false, points: 0 });
      infoHtml = `
        <p><strong>${escapeHtml(name)}</strong> (${escapeHtml(rarity)})</p>
        <p>Size: ${fish.size_cm.toFixed(1)} cm · Weight: ${fish.weight_kg.toFixed(2)} kg</p>
        <p><strong>Points +0</strong></p>
        <p style="margin-top:6px;">도망가 버렸어요!</p>
      `;
    }
    if (reelBattle.info) {
      reelBattle.info.innerHTML = infoHtml;
    }
    if (reelBattle.nextBtn) {
      reelBattle.nextBtn.disabled = false;
      reelBattle.nextBtn.classList.remove('disabled');
    }
    const hasMore = reelBattle.index < reelBattle.queue.length - 1;
    if (hasMore) {
      startNextBattleCountdown();
    } else {
      clearNextBattleCountdown();
    }
  }

  function updateReelBattle(dt) {
    const summaryVisible = reelBattle.summaryModal?.style.display === 'flex';
    if (reelBattle.summaryCountdownActive) {
      reelBattle.summaryCountdownTimer = Math.max(0, reelBattle.summaryCountdownTimer - dt);
      if (reelBattle.summaryCountdownLabel) {
        const seconds = Math.max(0, reelBattle.summaryCountdownTimer);
        reelBattle.summaryCountdownLabel.textContent = `${seconds.toFixed(1)}s`;
      }
      if (reelBattle.summaryCountdownTimer <= 0 && summaryVisible) {
        reelBattle.summaryCountdownActive = false;
        closeCatchSummary();
        return;
      }
    }

    const state = reelBattle.state;
    if (!state || !reelBattle.modal || summaryVisible) return;
    const previousPos = state.fishPos;
    state.elapsed = Math.min(state.elapsed + dt, state.duration + 0.6);
    const t = window.clamp(state.elapsed / state.duration, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const currentWidth = window.lerp(1, state.finalWhite, eased);
    state.currentWidth = currentWidth;
    const whiteLeft = 0.5 - currentWidth / 2;
    if (reelBattle.white) {
      reelBattle.white.style.left = `${whiteLeft * 100}%`;
      reelBattle.white.style.width = `${currentWidth * 100}%`;
    }
    state.fishPhase += dt * state.fishSpeed;
    const safeAmplitude = Math.max(0.02, currentWidth / 2 - state.redWidth / 2 - 0.01);
    if (state.success) {
      const amp = Math.max(0.02, safeAmplitude);
      state.fishPos = 0.5 + Math.sin(state.fishPhase) * amp;
      state.fishPos = window.clamp(state.fishPos, whiteLeft + 0.02, whiteLeft + currentWidth - 0.02);
    } else {
      if (!state.failTriggered && state.elapsed > state.duration * 0.45) {
        state.failTriggered = true;
      }
      if (state.failTriggered) {
        state.fishPos += state.failDirection * dt * 0.55;
      } else {
        const amp = Math.max(0.02, safeAmplitude * 0.8);
        state.fishPos = 0.5 + Math.sin(state.fishPhase) * amp;
      }
    }
    const delta = state.fishPos - previousPos;
    if (Math.abs(delta) > 0.0005) {
      state.fishDirection = delta > 0 ? 1 : -1;
    }
    const facingRight = state.fishDirection > 0;
    const trackWidth = reelBattle.white?.parentElement?.clientWidth || 0;
    if (reelBattle.marker) {
      reelBattle.marker.style.left = `${state.fishPos * 100}%`;
    }
    if (reelBattle.fishImage && trackWidth) {
      const offset = (state.fishPos - 0.5) * trackWidth;
      reelBattle.fishImage.style.transform = `translate(-50%, -50%) translateX(${offset}px)`;
      reelBattle.fishImage.classList.toggle('flip', facingRight);
    } else if (reelBattle.fishImage) {
      reelBattle.fishImage.classList.toggle('flip', facingRight);
    }
    const whiteRight = whiteLeft + currentWidth;
    const redLeft = 0.5 - state.redWidth / 2;
    const redRight = 0.5 + state.redWidth / 2;
    if (!state.resolved) {
      if (state.success && currentWidth <= state.redWidth + 0.001) {
        if (state.fishPos >= redLeft && state.fishPos <= redRight) {
          resolveReelBattleOutcome(true);
        }
      }
      if (!state.success && (state.fishPos < whiteLeft || state.fishPos > whiteRight)) {
        resolveReelBattleOutcome(false);
      }
      if (state.elapsed >= state.duration + 0.5 && !state.resolved) {
        resolveReelBattleOutcome(state.success);
      }
    }
    if (reelBattle.autoAdvanceActive) {
      reelBattle.autoAdvanceTimer = Math.max(0, reelBattle.autoAdvanceTimer - dt);
      if (reelBattle.nextCountdownLabel) {
        const seconds = Math.max(0, reelBattle.autoAdvanceTimer);
        reelBattle.nextCountdownLabel.textContent = `${seconds.toFixed(1)}s`;
      }
      if (reelBattle.autoAdvanceTimer <= 0) {
        clearNextBattleCountdown();
        if (reelBattle.state && reelBattle.state.resolved) {
          reelBattle.state = null;
        }
        beginNextReelBattle();
        return;
      }
    }
  }

  function finishReelBattleSequence() {
    reelBattle.state = null;
    setModalVisibility(reelBattle.modal, false);
    showCatchSummary();
  }

  function showCatchSummary() {
    if (!reelBattle.summaryModal) {
      preparePlayRound(true);
      return;
    }
    const list = reelBattle.summaryList;
    if (list) {
      if (!reelBattle.results.length) {
        list.innerHTML = '<p>아무 것도 잡지 못했습니다.</p>';
      } else {
        list.innerHTML = reelBattle.results
          .map((result, index) => {
            const fish = result.fish;
            const name = escapeHtml(fish.spec?.displayName || `Catch ${index + 1}`);
            const rarity = escapeHtml(fish.spec?.rarity || 'Unknown');
            const points = result.points;
            const label = result.success ? `+${points}` : '+0';
            const status = result.success ? '성공' : '실패';
            return `<p><span>${index + 1}. ${name} (${rarity}) – ${status}</span><span>${label}</span></p>`;
          })
          .join('');
      }
    }
    if (reelBattle.summaryTotal) {
      reelBattle.summaryTotal.textContent = reelBattle.totalPoints.toLocaleString();
    }
    setModalVisibility(reelBattle.summaryModal, true);
    startSummaryCountdown();
  }

  function closeCatchSummary() {
    clearSummaryCountdown();
    const total = reelBattle.totalPoints;
    setModalVisibility(reelBattle.summaryModal, false);
    if (total > 0) {
      window.addPointsWithSparkle(total);
    } else {
      window.setHUD();
    }
    resetReelBattle();
    preparePlayRound(true);
  }

  function resetTargetCircle() {
    window.world.targetCircle = {
      distance: TARGET_MIN_DISTANCE,
      velocity: 0,
      holding: false,
      holdTime: 0,
      reachedTop: false
    };
    window.world.castStage = 'aiming';
    window.world.bobberVisible = false;
    window.world.bobberDist = TARGET_MIN_DISTANCE;
    window.world.castDistance = TARGET_MIN_DISTANCE;
    window.world.sinkTimer = 0;
    window.world.sinkDuration = 0;
    window.world.sinkStartDist = TARGET_MIN_DISTANCE;
    window.world.sinkEndDist = TARGET_MIN_DISTANCE;
    if (window.waveEffect) {
      window.waveEffect.playing = false;
      window.waveEffect.frameIndex = 0;
      window.waveEffect.timer = 0;
    }
  }

  function updateDistanceReadout() {
    if (!window.distanceEl) return;
    window.distanceEl.textContent = `Distance: ${Math.round(window.world.bobberDist)}m`;
  }

  function respawnFishPopulation() {
    const spawnInfo = spawnFishes(window.settings.maxCast, { spread: true, halfWidth: WORLD_HALF_WIDTH });
    window.world.fishes = spawnInfo.fishes;
    window.world.lateralLimit = spawnInfo.lateralLimit;
    window.world.displayRange = spawnInfo.displayRange;
  }

  function preparePlayRound(respawn = true) {
    window.state = window.GameState.Targeting;
    window.camera.y = 0;
    window.world.actives = [];
    window.world.catches = [];
    window.resultsIndex = 0;
    window.world.time = 0;
    window.world.targetZoom = 1;
    window.world.viewZoom = 1;
    window.world.bobberVisible = false;
    resetReelBattle();
    window.world.autoTargetDistance = null;
    window.world.autoCastTimer = 0;
    window.world.autoHoldActive = false;
    window.world.autoReleaseDelay = 0;
    if (window.waveEffect) {
      window.waveEffect.playing = false;
      window.waveEffect.frameIndex = 0;
      window.waveEffect.timer = 0;
    }
    if (respawn || !Array.isArray(window.world.fishes) || !window.world.fishes.length) {
      respawnFishPopulation();
    } else {
      for (const fish of window.world.fishes) {
        if (!fish) continue;
        fish.finished = false;
        fish.engaged = false;
        fish.active = null;
        fish.escapeTimer = 0;
        if (fish.position && Number.isFinite(fish.position.y)) {
          fish.homeY = fish.homeY ?? fish.position.y;
        } else if (Number.isFinite(fish.distance)) {
          fish.homeY = fish.homeY ?? fish.distance;
        }
        if (!Number.isFinite(fish.verticalRange)) {
          fish.verticalRange = window.FISH_VERTICAL_HOME_RANGE ?? 32;
        }
        fish.alertTimer = 0;
        fish.alertVector = null;
        fish.wanderTimer = window.rand(0.6, 1.4);
      }
    }
    resetTargetCircle();
    updateDistanceReadout();
    if (window.minimap) window.minimap.style.display = 'flex';
    if (window.distanceEl) window.distanceEl.style.display = 'block';
    setCastPrompt(true, 'Press the Screen to cast the bobber');
    resetCharacterToIdle();
    if (window.world.autoMode) {
      scheduleAutoCast(window.rand(0.3, 0.6));
    }
  }

  function exitToMenu() {
    setAutoMode(false, false);
    window.state = window.GameState.Idle;
    window.camera.y = 0;
    setCastPrompt(false);
    awardRemainingCatchPoints();
    resetReelBattle();
    window.world.targetCircle = null;
    window.world.actives = [];
    window.world.catches = [];
    window.world.fishes = [];
    window.world.targetZoom = 1;
    window.world.viewZoom = 1;
    window.world.bobberDist = TARGET_MIN_DISTANCE;
    window.world.castDistance = TARGET_MIN_DISTANCE;
    window.world.castStage = 'idle';
    window.world.bobberVisible = false;
    window.world.sinkTimer = 0;
    window.world.sinkDuration = 0;
    window.world.sinkStartDist = TARGET_MIN_DISTANCE;
    window.world.sinkEndDist = TARGET_MIN_DISTANCE;
    window.resultsIndex = 0;
    if (window.results) window.results.style.display = 'none';
    if (window.minimap) window.minimap.style.display = 'none';
    if (window.distanceEl) window.distanceEl.style.display = 'none';
    resetCharacterToIdle();
    window.setGameplayLayout(false);
    updateDistanceReadout();
    if (window.waveEffect) {
      window.waveEffect.playing = false;
      window.waveEffect.frameIndex = 0;
      window.waveEffect.timer = 0;
    }
  }

  function startPlaySession() {
    window.setGameplayLayout(true);
    window.settings.energy = Math.max(0, window.settings.energy - 1);
    window.setHUD();
    preparePlayRound(true);
  }

  function updateTargeting(dt) {
    if (window.world.castStage !== 'aiming') return;
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
    if (window.world.castStage !== 'aiming') return;
    const target = window.world.targetCircle;
    if (!target) return;
    target.holding = true;
    target.holdTime = 0;
    target.velocity = 0;
    target.reachedTop = false;
    setCastPrompt(false);
    startCharacterCastAnimation();
  }

  function triggerBobberImpact(distance) {
    if (!window.waveEffect || !window.waveEffect.image) {
      if (window.waveEffect) {
        window.waveEffect.distance = distance;
      }
      return;
    }
    window.waveEffect.playing = true;
    window.waveEffect.frameIndex = 0;
    window.waveEffect.timer = 0;
    window.waveEffect.distance = distance;
    window.waveEffect.lateral = 0;
  }

  function scatterFishesAroundTarget(distance) {
    if (!Array.isArray(window.world.fishes) || !window.world.fishes.length) return;
    const fishes = window.world.fishes;
    const scatterDuration = window.FISH_SCATTER_DURATION ?? 1;
    const alertDuration = window.FISH_ALERT_DURATION ?? 1;
    const scareRadius = window.BOBBER_SCARE_RADIUS ?? window.FISH_SCATTER_MIN_RADIUS ?? 1;
    const force = window.FISH_SCATTER_FORCE ?? 14;
    const baseChance = window.BOBBER_SCARE_BASE_CHANCE ?? 0.4;
    const rarityChances = window.BOBBER_SCARE_PROBABILITY || {};

    for (const fish of fishes) {
      if (!fish || fish.finished) continue;
      const position = fish.position || { x: 0, y: fish.distance ?? distance };
      const dx = position.x;
      const dy = (position.y ?? fish.distance ?? distance) - distance;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!Number.isFinite(dist) || dist > scareRadius) continue;

      const rarity = fish.spec?.rarity || 'Common';
      const chance = Math.min(1, Math.max(0, rarityChances[rarity] ?? baseChance));
      if (Math.random() > chance) continue;

      let dirX = dx;
      let dirY = dy;
      if (!Number.isFinite(dirX) || !Number.isFinite(dirY) || Math.abs(dirX) + Math.abs(dirY) < 0.001) {
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }
      const length = Math.hypot(dirX, dirY) || 1;
      const safeDirX = dirX / length;
      const safeDirY = dirY / length;

      if (!fish.position) fish.position = { x: 0, y: fish.distance ?? distance };
      if (!fish.velocity) fish.velocity = { x: 0, y: 0 };
      if (!fish.targetVelocity) fish.targetVelocity = { x: 0, y: 0 };

      const baseSpeed = Math.max(fish.swimSpeed || force, 0);
      fish.targetVelocity.x = safeDirX * baseSpeed;
      fish.targetVelocity.y = safeDirY * baseSpeed * 0.7;
      fish.velocity.x = fish.targetVelocity.x;
      fish.velocity.y = fish.targetVelocity.y;
      fish.moving = true;
      fish.escapeTimer = Math.max(fish.escapeTimer ?? 0, scatterDuration);
      fish.alertTimer = alertDuration;
      fish.alertVector = { x: safeDirX, y: safeDirY };
      if (typeof fish.wanderTimer === 'number') fish.wanderTimer = Math.min(fish.wanderTimer, 0.1);
      fish.stressLevel = Math.min(1, (fish.stressLevel ?? 0) + 0.4);
    }
  }

  function beginSinkPhase() {
    if (window.world.castStage !== 'aiming') return;
    const target = window.world.targetCircle;
    if (!target) return;
    window.world.castStage = 'sinking';
    window.world.bobberVisible = true;
    window.world.sinkTimer = 0;
    window.world.sinkDuration = SINK_DURATION;
    window.world.sinkStartDist = target.distance;
    const dropTarget = target.distance - SINK_DISTANCE_DROP;
    window.world.sinkEndDist = window.clamp(dropTarget, SINK_MIN_DISTANCE, target.distance);
    window.world.bobberDist = target.distance;
    window.world.castDistance = target.distance;
    scatterFishesAroundTarget(target.distance);
    triggerBobberImpact(target.distance);
    window.world.targetCircle = null;
    setCastPrompt(true, 'Pull!');
    updateDistanceReadout();
  }

  function updateSinkPhase(dt) {
    if (window.world.castStage !== 'sinking') return;
    const duration = window.world.sinkDuration || SINK_DURATION;
    window.world.sinkTimer += dt;
    const t = window.clamp(duration > 0 ? window.world.sinkTimer / duration : 1, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const nextDist = window.lerp(window.world.sinkStartDist, window.world.sinkEndDist, eased);
    window.world.bobberDist = window.clamp(nextDist, SINK_MIN_DISTANCE, TARGET_MAX_DISTANCE);
    updateDistanceReadout();
    if (window.world.sinkTimer >= duration) {
      finalizeCatchAttempt();
    }
  }

  function updateBobberWave(dt) {
    const effect = window.waveEffect;
    if (!effect || !effect.playing || !effect.image) return;
    const frameDuration = effect.frameDuration > 0 ? effect.frameDuration : 0.08;
    effect.timer += dt;
    while (effect.timer >= frameDuration) {
      effect.timer -= frameDuration;
      effect.frameIndex += 1;
      if (effect.frameIndex >= effect.frameCount) {
        effect.playing = false;
        effect.frameIndex = effect.frameCount - 1;
        effect.timer = 0;
        break;
      }
    }
  }

  function finalizeCatchAttempt() {
    if (window.world.castStage === 'resolved') return;
    window.world.castStage = 'resolved';
    setCastPrompt(false);
    const actives = Array.isArray(window.world.actives) ? window.world.actives.slice() : [];
    let anyActive = false;
    for (const active of actives) {
      if (!active || !active.fish) continue;
      anyActive = true;
      releaseActiveCircle(active, false);
    }
    window.world.actives = [];
    window.world.bobberVisible = false;

    const detectionRange = window.DETECTION_RANGE_M ?? 5;
    const candidates = gatherFishCandidates(detectionRange);
    if (!candidates.length) {
      window.showMissEffect();
      if (!anyActive) {
        window.toast('Miss – no fish bit the bobber.');
      }
      preparePlayRound(true);
      return;
    }

    for (const fish of candidates) {
      if (!fish) continue;
      fish.engaged = false;
      if (fish.active) fish.active = null;
    }
    window.world.catches = [];
    startReelBattleSequence(candidates);
  }

  function handlePointerUp() {
    if (window.state !== window.GameState.Targeting) return;
    if (window.world.castStage !== 'aiming') return;
    const target = window.world.targetCircle;
    if (!target || !target.holding) return;
    target.holding = false;
    target.velocity = 0;
    window.world.targetZoom = 1;
    beginSinkPhase();
  }

  function showResults() {
    window.state = window.GameState.Results;
    window.world.castStage = 'idle';
    window.world.bobberVisible = false;
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

    window.rTitle.textContent = `Catch ${window.resultsIndex + 1}/${count}`;
    const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapeAttr = value => escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const fishImages = fish.spec?.images || {};
    const accentColor = escapeAttr(fish.spec?.ui?.mapColorHex || '#6fffe9');
    const imageSrc = (fish.image && fish.image.src) || fishImages.card || fishImages.illustration || fishImages.sprite || '';
    const altText = fish.spec?.displayName ? `${fish.spec.displayName} illustration` : 'Caught fish illustration';
    const safeAlt = escapeAttr(altText);
    const safeName = escapeHtml(fish.spec.displayName || 'Mystery Fish');
    const safeRarity = escapeHtml(fish.spec.rarity || 'Unknown');
    const visual = imageSrc
      ? `<img src="${escapeAttr(imageSrc)}" alt="${safeAlt}" loading="lazy" />`
      : '<div class="placeholder" aria-hidden="true"></div>';

    window.rBody.innerHTML = `
      <div class="catch-visual">
        ${visual}
        <div>
          <h4 style="color: ${accentColor}; margin-bottom: 10px;">${safeName}</h4>
          <p><strong>Size:</strong> ${fish.size_cm.toFixed(1)} cm</p>
          <p><strong>Weight:</strong> ${fish.weight_kg.toFixed(2)} kg</p>
          <p><strong>Rarity:</strong> ${safeRarity}</p>
          <p><strong>Points:</strong> ${points}</p>
        </div>
      </div>
    `;
    window.rNext.textContent = window.resultsIndex < count - 1 ? 'Next' : 'Continue';
  }

  function awardRemainingCatchPoints() {
    return;
  }

  function closeResultsToContinue() {
    awardRemainingCatchPoints();
    if (window.results) window.results.style.display = 'none';
    window.resultsIndex = 0;
    preparePlayRound(true);
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

  function ensureMinimapStructure() {
    if (!window.mmbar) return null;
    if (!window.mmCells) {
      const existingCells = window.mmbar.querySelector('.mmcells');
      if (existingCells) {
        window.mmCells = existingCells;
      } else {
        const cells = document.createElement('div');
        cells.className = 'mmcells';
        window.mmbar.appendChild(cells);
        window.mmCells = cells;
      }
    }
    if (!window.mmViewport) {
      const existingViewport = window.mmbar.querySelector('.mmviewport');
      if (existingViewport) {
        window.mmViewport = existingViewport;
      } else {
        const viewport = document.createElement('div');
        viewport.className = 'mmviewport';
        window.mmbar.appendChild(viewport);
        window.mmViewport = viewport;
      }
    }
    if (!window.mmIndicator) {
      const existingIndicator = window.mmbar.querySelector('.mmbobber');
      if (existingIndicator) {
        window.mmIndicator = existingIndicator;
      } else {
        const indicator = document.createElement('div');
        indicator.className = 'mmbobber';
        window.mmbar.appendChild(indicator);
        window.mmIndicator = indicator;
      }
    }
    return window.mmCells;
  }

  function clearMinimap(hideContainer = false) {
    const cells = ensureMinimapStructure();
    if (cells) cells.innerHTML = '';
    if (window.mmViewport) window.mmViewport.style.opacity = '0';
    if (window.mmIndicator) window.mmIndicator.style.opacity = '0';
    if (hideContainer && window.minimap) {
      window.minimap.style.display = 'none';
    }
  }

  function updateMinimap(metrics = window.latestMetrics) {
    if (!window.mmbar || !window.minimap) return;
    const cells = ensureMinimapStructure();
    if (!cells) return;

    if (window.state !== window.GameState.Targeting) {
      clearMinimap(true);
      return;
    }

    if (!Array.isArray(window.world.fishes) || !window.world.fishes.length) {
      clearMinimap(true);
      return;
    }

    if (window.minimap.style.display !== 'flex') {
      window.minimap.style.display = 'flex';
    }

    const minDist = window.MIN_CAST_DISTANCE ?? 0;
    const maxDist = window.MAX_CAST_DISTANCE ?? (window.settings?.maxCast ?? minDist + 1);
    const range = Math.max(1, maxDist - minDist);
    const baseSegmentSize = Math.max(1, window.MINIMAP_SEGMENT_METERS || 5);
    const targetSegments = Math.max(1, Math.ceil(range / baseSegmentSize));
    const maxSegments = Math.max(8, window.MINIMAP_SEGMENTS || targetSegments);
    const segments = Math.max(8, Math.min(maxSegments, targetSegments));
    const segmentMeters = Math.max(range / segments, 1);

    const rarityEntries = new Array(segments).fill(null);
    const engagedSegments = new Array(segments).fill(false);
    const priorityMap = window.RARITY_PRIORITY || {};
    const colorMap = window.RARITY_COLORS || {};

    for (const fish of window.world.fishes) {
      if (!fish || fish.finished) continue;
      const dist = clamp(fish.position?.y ?? fish.distance ?? minDist, minDist, maxDist);
      const index = Math.min(segments - 1, Math.max(0, Math.floor((dist - minDist) / segmentMeters)));
      const rarity = fish.spec?.rarity || 'Common';
      const priority = priorityMap[rarity] ?? 0;
      const existing = rarityEntries[index];
      if (!existing || priority > existing.priority) {
        rarityEntries[index] = { rarity, priority, color: colorMap[rarity] };
      }
      if (fish.engaged) engagedSegments[index] = true;
    }

    cells.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (let i = segments - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'mmcell';
      const entry = rarityEntries[i];
      if (entry && entry.color) {
        const color = entry.color;
        cell.style.background = `linear-gradient(180deg, ${color}cc 0%, ${color}99 100%)`;
        cell.style.opacity = '1';
      } else if (entry) {
        cell.style.background = 'rgba(30, 64, 175, 0.55)';
        cell.style.opacity = '0.9';
      } else {
        cell.style.background = 'rgba(15, 23, 42, 0.7)';
        cell.style.opacity = '0.45';
      }
      if (engagedSegments[i]) {
        cell.style.boxShadow = 'inset 0 0 6px rgba(111, 255, 233, 0.55)';
      }
      fragment.appendChild(cell);
    }
    cells.appendChild(fragment);

    const barHeight = window.mmbar.clientHeight || window.minimap.clientHeight;
    const metricsRef = metrics || window.latestMetrics;

    if (window.mmViewport && barHeight > 0 && metricsRef && window.canvas) {
      const pxPerMeter = metricsRef.pxPerMeter || (window.canvas.height / Math.max(1, window.settings.maxCast));
      const farMeters = clamp((metricsRef.waterSurfaceY + window.camera.y) / pxPerMeter, minDist, maxDist);
      const nearMeters = clamp((metricsRef.waterSurfaceY + window.camera.y - window.canvas.height) / pxPerMeter, minDist, maxDist);
      const farRatio = clamp((farMeters - minDist) / range, 0, 1);
      const nearRatio = clamp((nearMeters - minDist) / range, 0, 1);
      const topPx = (1 - farRatio) * barHeight;
      const bottomPx = (1 - nearRatio) * barHeight;
      const top = Math.min(topPx, bottomPx);
      const bottom = Math.max(topPx, bottomPx);
      const height = Math.max(6, bottom - top);
      window.mmViewport.style.top = `${top}px`;
      window.mmViewport.style.height = `${height}px`;
      window.mmViewport.style.opacity = '1';
    } else if (window.mmViewport) {
      window.mmViewport.style.opacity = '0';
    }

    if (window.mmIndicator && barHeight > 0 && window.world.bobberVisible) {
      const bobberMeters = clamp(window.world.bobberDist, minDist, maxDist);
      const bobberRatio = clamp((bobberMeters - minDist) / range, 0, 1);
      const pos = (1 - bobberRatio) * barHeight;
      window.mmIndicator.style.top = `${pos}px`;
      window.mmIndicator.style.opacity = '1';
    } else if (window.mmIndicator) {
      window.mmIndicator.style.opacity = '0';
    }
  }

  function render() {
    if (!window.canvas || !window.ctx) return;

    const W = window.canvas.width;
    const H = window.canvas.height;
    const metrics = getEnvironmentMetrics(W, H);
    window.latestMetrics = metrics;
    const distancePx = window.world.bobberDist * metrics.pxPerMeter;
    const bobberWorldY = metrics.waterSurfaceY - distancePx;
    const bobberScreenY = bobberWorldY + window.camera.y;
    const bobberX = W * 0.5 + metrics.bobberOffsetX;
    const lateralScale = (W * 0.82) / (Math.max(1, window.world.lateralLimit || WORLD_HALF_WIDTH) * 2);
    let targetCircleScreenY = bobberScreenY;
    if (window.world.targetCircle) {
      const circlePx = window.world.targetCircle.distance * metrics.pxPerMeter;
      const circleWorldY = metrics.waterSurfaceY - circlePx;
      targetCircleScreenY = circleWorldY + window.camera.y;
    }

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
      drawPassingSchool(W, H, metrics);
    }
    drawCharacterSprite(W, H, metrics, window.camera.y);

    if (window.state === window.GameState.Targeting) {
      const stage = window.world.castStage;
      if (stage === 'aiming' && window.world.targetCircle) {
        drawTargetCircle(bobberX, targetCircleScreenY);
      }
      if (window.world.bobberVisible) {
        drawBobberWaveEffect(W, metrics, lateralScale);
        drawFishingLine(window.rodAnchor.x, window.rodAnchor.y, bobberX, bobberScreenY);
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
        let drawnHeight = 18;
        if (fishImage) {
          const fishScale = 0.75;
          const fishW = fishImage.width * fishScale;
          const fishH = fishImage.height * fishScale;
          drawnHeight = fishH;
          const facingRight = !!fish.facingRight;
          if (facingRight) {
            window.ctx.save();
            window.ctx.translate(fishScreenX, fishScreenY);
            window.ctx.scale(-1, 1);
            window.ctx.drawImage(fishImage, -fishW / 2, -fishH / 2, fishW, fishH);
            window.ctx.restore();
          } else {
            window.ctx.drawImage(fishImage, fishScreenX - fishW / 2, fishScreenY - fishH / 2, fishW, fishH);
          }
        } else {
          const fishSize = 10;
          drawnHeight = fishSize * 1.2;
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
        if (fish.alertTimer > 0) {
          const alertDuration = window.FISH_ALERT_DURATION ?? 1;
          const progress = window.clamp(fish.alertTimer / Math.max(0.001, alertDuration), 0, 1);
          const bounce = Math.sin((1 - progress) * Math.PI * 2) * 4;
          const bubbleRadius = 12;
          const bubbleX = fishScreenX;
          const bubbleY = fishScreenY - drawnHeight / 2 - bubbleRadius - 6 + bounce;
          window.ctx.save();
          window.ctx.globalAlpha = 0.92;
          window.ctx.fillStyle = '#ffffff';
          window.ctx.beginPath();
          window.ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
          window.ctx.fill();
          window.ctx.strokeStyle = '#ef4444';
          window.ctx.lineWidth = 2;
          window.ctx.stroke();
          window.ctx.beginPath();
          window.ctx.moveTo(bubbleX - 4, bubbleY + bubbleRadius - 2);
          window.ctx.lineTo(bubbleX, bubbleY + bubbleRadius + 6);
          window.ctx.lineTo(bubbleX + 4, bubbleY + bubbleRadius - 2);
          window.ctx.closePath();
          window.ctx.fill();
          window.ctx.stroke();
          window.ctx.fillStyle = '#ef4444';
          window.ctx.font = 'bold 14px sans-serif';
          window.ctx.textAlign = 'center';
          window.ctx.textBaseline = 'middle';
          window.ctx.fillText('!', bubbleX, bubbleY + 1);
          window.ctx.restore();
        }
      }

      if (window.world.bobberVisible) {
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
    updateBobberWave(dt);
    updateReelBattle(dt);
    updateAutoPlay(dt);

    const metrics = getEnvironmentMetrics(window.canvas.width, window.canvas.height);
    if (window.state === window.GameState.Targeting) {
      if (window.world.castStage === 'aiming') {
        updateTargeting(dt);
      } else if (window.world.castStage === 'sinking') {
        updateSinkPhase(dt);
      }
    }
    updateCamera(window.world.bobberDist, metrics, dt, window.state);

    const zoomSmooth = 1 - Math.pow(0.001, dt * 6);
    const targetZoom = window.state === window.GameState.Targeting ? (window.world.targetZoom || 1) : 1;
    window.world.viewZoom += (targetZoom - window.world.viewZoom) * zoomSmooth;
    if (!Number.isFinite(window.world.viewZoom)) window.world.viewZoom = 1;

    render();
    if (window.state === window.GameState.Targeting) {
      updateMinimap();
    } else {
      clearMinimap();
      if (window.minimap) window.minimap.style.display = 'none';
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
        closeResultsToContinue();
      }
    });

    window.rSkip.addEventListener('click', () => {
      closeResultsToContinue();
    });

    if (reelBattle.nextBtn) {
      reelBattle.nextBtn.addEventListener('click', () => {
        if (!reelBattle.state || !reelBattle.state.resolved) return;
        clearNextBattleCountdown();
        reelBattle.state = null;
        beginNextReelBattle();
      });
    }

    if (reelBattle.summaryClose) {
      reelBattle.summaryClose.addEventListener('click', () => {
        closeCatchSummary();
      });
    }

    const comingSoon = label => () => window.toast(`${label} – Coming Soon`);
    if (window.shopBtn) window.shopBtn.addEventListener('click', comingSoon('Shop'));
    if (window.rankBtn) window.rankBtn.addEventListener('click', comingSoon('Ranking'));
    if (window.premiumBtn) window.premiumBtn.addEventListener('click', comingSoon('Premium Mode'));
    if (window.exitBtn) {
      window.exitBtn.addEventListener('click', () => {
        exitToMenu();
      });
    }

    if (window.autoBtn) {
      window.autoBtn.addEventListener('click', () => {
        if (!window.dataLoaded || !window.assetsReady) {
          window.toast('Load the data first.');
          return;
        }
        if (!window.world.autoMode) {
          if (window.state === window.GameState.Idle) {
            if (window.settings.energy <= 0) {
              window.toast('Not enough energy.');
              return;
            }
            startPlaySession();
          }
          setAutoMode(true);
        } else {
          setAutoMode(false);
        }
      });
    }
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

