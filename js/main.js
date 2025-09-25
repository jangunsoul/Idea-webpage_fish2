// === 메인 게임 로직 ===

// 데이터 로딩
async function loadGameData() {
  if (loadingPromise) return loadingPromise;

  startBtn.textContent = 'Loading data...';
  startBtn.classList.add('disabled');
  startBtn.classList.remove('error');

  loadingPromise = (async () => {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      hydrateGameData(data);
      await prepareAssets();
      dataLoaded = true;
      startBtn.textContent = 'Touch to Start';
      startBtn.classList.remove('disabled', 'error');
      return true;
    } catch (err) {
      console.error('Failed to load game data:', err);
      dataLoaded = false;
      assetsReady = false;
      startBtn.textContent = 'Retry Data Load';
      startBtn.classList.remove('disabled');
      startBtn.classList.add('error');
      toast('Failed to load fish data');
      return false;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

// 게임 데이터 하이드레이션
function hydrateGameData(data) {
  gameData.assets = data.assets || {};
  gameData.species = Array.isArray(data.species) ? data.species : [];
  gameData.characters = Array.isArray(data.characters) ? data.characters : [];
  gameData.environment = data.environment || null;
  gameData.player = data.player || null;
  SPECIES = gameData.species;
  CHARACTERS = gameData.characters;
  if (gameData.resources?.icons) gameData.resources.icons.star = null;

  const env = gameData.environment || {};
  if (env.tileWidth > 0) environmentState.tileWidth = env.tileWidth;
  if (env.tileHeight > 0) environmentState.tileHeight = env.tileHeight;
  if (env.landRows > 0) environmentState.landRows = Math.max(1, Math.floor(env.landRows));
  environmentState.sources = { 
    water: env.waterTile || null, 
    shore: env.shoreTile || null, 
    land: env.landTile || null 
  };
  applyPlayerConfig();
}

// 플레이어 설정 적용
function applyPlayerConfig() {
  const base = gameData.player || {};
  const playerChar = CHARACTERS.find(c => c && c.role === 'Player') || null;
  const charAnim = playerChar?.animation || {};
  
  characterSprite.spriteSource = base.spriteSheet || charAnim.spriteSheet || characterSprite.spriteSource;
  characterSprite.frameWidth = base.frameWidth || charAnim.frameWidth || characterSprite.frameWidth;
  characterSprite.frameHeight = base.frameHeight || charAnim.frameHeight || characterSprite.frameHeight;
  characterSprite.frameCount = base.frameCount || charAnim.frameCount || characterSprite.frameCount;
  characterSprite.idleFrame = base.idleFrame ?? charAnim.idleFrame ?? characterSprite.idleFrame;
  characterSprite.postCastFrame = base.postCastFrame ?? charAnim.postCastFrame ?? characterSprite.postCastFrame;
  if (base.castSequence || charAnim.castSequence) {
    characterSprite.castSequence = (base.castSequence || charAnim.castSequence).slice();
  }
  characterSprite.frameDuration = (base.frameDurationMs || charAnim.frameDurationMs || characterSprite.frameDuration * 1000) / 1000;
  characterSprite.scale = base.scale || charAnim.scale || characterSprite.scale;
  characterSprite.lineAnchor = base.lineAnchor || charAnim.lineAnchor || characterSprite.lineAnchor;
  characterSprite.holdFrame = characterSprite.postCastFrame ?? characterSprite.castSequence[characterSprite.castSequence.length - 1] ?? 0;
  if (!characterSprite.castSequence.length) {
    characterSprite.castSequence = [characterSprite.idleFrame, characterSprite.postCastFrame];
  }
  resetCharacterToIdle();
}

function resetCharacterToIdle() {
  characterSprite.playing = false;
  characterSprite.animationIndex = 0;
  characterSprite.timer = 0;
  characterSprite.currentFrame = characterSprite.idleFrame || 0;
  characterSprite.holdFrame = characterSprite.postCastFrame ?? characterSprite.currentFrame;
}

function startCharacterCastAnimation() {
  if (!characterSprite.castSequence.length) return;
  characterSprite.playing = true;
  characterSprite.animationIndex = 0;
  characterSprite.timer = 0;
  characterSprite.currentFrame = characterSprite.castSequence[0] ?? 0;
  characterSprite.holdFrame = characterSprite.postCastFrame ?? characterSprite.castSequence[characterSprite.castSequence.length - 1] ?? characterSprite.currentFrame;
}

// 에셋 준비
async function prepareAssets() {
  if (assetsReady) return true;
  if (assetPrepPromise) return assetPrepPromise;

  const tasks = [];
  const seen = new Map();
  const fishCache = new Map();

  const queue = (src, assign) => {
    if (!src) return;
    let loader = seen.get(src);
    if (!loader) {
      loader = loadImage(src);
      seen.set(src, loader);
    }
    tasks.push(loader.then(img => assign(img)).catch(err => console.warn('Asset load failed:', src, err)));
  };

  for (const spec of SPECIES) {
    const imgInfo = spec.images || {};
    const src = imgInfo.card || imgInfo.illustration || imgInfo.sprite || imgInfo.spriteSheet;
    if (!src) continue;
    queue(src, img => fishCache.set(spec.id, img));
  }

  const sources = environmentState.sources || {};
  queue(sources.water, img => { environmentState.water = img; });
  queue(sources.shore, img => { 
    environmentState.shore = img; 
    if (!gameData.environment?.tileWidth) environmentState.tileWidth = img.width; 
    if (!gameData.environment?.tileHeight) environmentState.tileHeight = img.height; 
  });
  queue(sources.land, img => { environmentState.land = img; });
  if (characterSprite.spriteSource) {
    queue(characterSprite.spriteSource, img => { characterSprite.image = img; });
  }

  assetPrepPromise = Promise.all(tasks).then(() => {
    gameData.resources.fish = fishCache;
    assetsReady = true;
    initPassingSchool(passingSchoolMode);
    resetCharacterToIdle();
    return true;
  }).catch(err => {
    assetsReady = false;
    throw err;
  }).finally(() => {
    assetPrepPromise = null;
  });

  return assetPrepPromise;
}

// 패싱 스쿨 초기화
function initPassingSchool(mode = 'title') {
  passingSchoolMode = mode;
  if (mode !== 'title') { 
    passingSchool = []; 
    return; 
  }
  
  const entries = Array.from(gameData.resources.fish.entries());
  if (!entries.length) { 
    passingSchool = []; 
    return; 
  }
  
  const count = Math.min(18, Math.max(8, entries.length * 2));
  passingSchool = Array.from({ length: count }, (_, i) => {
    const [id, img] = entries[i % entries.length];
    return { 
      id, img, 
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

// 게임 시작
startBtn.textContent = 'Loading data...';
startBtn.classList.add('disabled');
loadGameData();

// 이벤트 핸들러들
startBtn.addEventListener('click', () => {
  if (!dataLoaded) {
    if (loadingPromise) toast('Loading data...'); 
    else { loadGameData(); toast('Reloading data...'); }
    return;
  }
  if (state !== GameState.Idle) return;
  if (settings.energy <= 0) { toast('Not enough energy.'); return; }
  startCasting();
});

function startCasting() {
  setGameplayLayout(true);
  camera.y = 0;
  settings.energy--; 
  setHUD();
  title.style.display = 'none';
  gauge.style.display = 'flex';
  state = GameState.Casting;
  
  const barRect = bar.getBoundingClientRect();
  const w = barRect.width, cursorW = 5;
  let dir = 1, x = 0;
  const speed = w * 1.4;

  function frame(ts) {
    if (state !== GameState.Casting) return;
    if (!frame.last) frame.last = ts;
    const dt = (ts - frame.last)/1000; 
    frame.last = ts;
    x += dir * speed * dt;
    if (x <= 0) { x = 0; dir = 1; }
    if (x >= w - cursorW) { x = w - cursorW; dir = -1; }
    cursor.style.left = x + 'px';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const stop = () => {
    bar.removeEventListener('click', stop);
    gauge.style.display = 'none';
    const sweetRect = sweet.getBoundingClientRect();
    const sweetCenter = sweetRect.left + sweetRect.width/2;
    const cursorCenter = barRect.left + x + cursorW/2;
    const dx = Math.abs(cursorCenter - sweetCenter);
    const max = sweetRect.width/2;
    const closeness = clamp(1 - dx / max, 0, 1);
    const distance = Math.round(lerp(settings.baseCast, settings.maxCast, closeness));
    startFlight(distance);
  };
  bar.addEventListener('click', stop);
}

function startFlight(dist) {
  state = GameState.Flight;
  world.castDistance = dist;
  world.bobberDist = 0;
  const metrics = getEnvironmentMetrics(canvas.clientWidth, canvas.clientHeight);
  const spawnInfo = spawnFishes(dist, metrics, canvas.clientWidth);
  world.fishes = spawnInfo.fishes;
  world.lateralLimit = spawnInfo.lateralLimit;
  world.displayRange = spawnInfo.displayRange;
  world.actives = []; 
  world.catches = [];
  world.time = 0;
  startCharacterCastAnimation();
  distanceEl.style.display = 'block';
  minimap.style.display = 'none';
}

function startFishing() {
  state = GameState.Fishing;
  world.bobberDist = world.castDistance;
  minimap.style.display = 'block';
  distanceEl.style.display = 'block';
}

function endRunNoCatch() {
  toast('No Fish Caught');
  setTimeout(() => {
    state = GameState.Idle;
    title.style.display = 'flex';
    resetCharacterToIdle();
    setGameplayLayout(false);
  }, 700);
}

// 입력 처리
window.addEventListener('pointerdown', () => {
  if (state === GameState.Fishing) {
    const anyActive = world.actives.length > 0;
    let caughtNow = [];
    for (const a of world.actives) {
      const success = rollCatch(a);
      if (success) caughtNow.push(a.fish);
    }
    if (caughtNow.length) {
      for (const f of caughtNow) {
        if (f.active) releaseActiveCircle(f.active, false);
        f.finished = true;
        f.engaged = false;
        world.catches.push(f);
      }
      showResults();
    } else if (anyActive) {
      showMissEffect(); // 개선된 Miss 이펙트
    }
  }
});

canvas.addEventListener('click', () => {
  if (state === GameState.Idle) startCasting();
});

// 결과 화면
let rIndex = 0;
function showResults() {
  state = GameState.Results;
  rIndex = 0;
  results.style.display = 'flex';
  minimap.style.display = 'none';
  renderResultCard();
}

function renderResultCard() {
  const count = world.catches.length;