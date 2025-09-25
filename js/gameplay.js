// === 게임플레이 로직 ===

// 종족 샘플링
function sampleSpecies() {
  if (!SPECIES.length) return null;
  const pool = [];
  for (const s of SPECIES) {
    const w = RARITY_WEIGHTS[s.rarity] || 1;
    for (let i = 0; i < w; i++) pool.push(s);
  }
  if (!pool.length) return null;
  return pick(pool);
}

// 물고기 스폰
function spawnFishes(dist, options = {}) {
  const halfWidth = options.halfWidth ?? 5;
  if (!SPECIES.length) return { fishes: [], lateralLimit: halfWidth, displayRange: halfWidth };

  const spread = !!options.spread;
  const fishes = [];
  const minDistance = 30;
  const maxDistance = spread ? 200 : Math.min(dist + 20, 200);
  const density = spread ? randi(12, 18) : randi(6, 10);

  for (let i = 0; i < density; i++) {
    const spec = sampleSpecies();
    if (!spec) continue;

    const size = rand(spec.size_cm.min, spec.size_cm.max);
    const weight = rand(spec.weight_kg.min, spec.weight_kg.max);
    const distance = rand(minDistance, maxDistance);
    const lateral = rand(-halfWidth, halfWidth);

    const fishMap = gameData?.resources?.fish;
    const cachedImage = fishMap?.get?.(spec.id);

    const fish = {
      specId: spec.id, spec, distance, size_cm: size, weight_kg: weight, engaged: false, finished: false,
      iconColor: spec.ui.mapColorHex, position: { x: lateral, y: distance },
      velocity: { x: 0, y: 0 }, targetVelocity: { x: 0, y: 0 }, bonusMultiplier: 1,
      escapeTimer: 0, lastCircleTime: -Infinity, renderCache: null, image: cachedImage || null, active: null,
      stressLevel: 0, personalityFactor: rand(0.8, 1.2), moveBias: getFishMoveBias(spec),
      facingRight: Math.random() > 0.5,
      swimSpeed: getFishSwimSpeed(spec, weight)
    };
    fishes.push(fish);
  }
  
  // 보너스 물고기 설정
  if (fishes.length) {
    const pool = fishes.slice();
    const special = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (special) special.bonusMultiplier = 2;
    if (pool.length && Math.random() < 0.25) {
      const rare = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if (rare) rare.bonusMultiplier = 3;
    }
  }

  fishes.sort((a, b) => a.distance - b.distance);
  return { fishes, lateralLimit: halfWidth, displayRange: halfWidth };
}

// === 개선된 잡기 확률 시스템 ===
function rollCatch(active) {
  const f = active.fish;
  const spec = f.spec;
  const r = clamp((active.radius - active.minR) / (active.maxR - active.minR), 0, 1);
  const skill = 1 - r;
  
  let p = 0.15 + 0.75 * skill; // 기본 확률 대폭 향상
  p *= (0.8 + 0.5 * spec.behavior.approachBias);
  
  const stressPenalty = 1 - (f.stressLevel * 0.2);
  p *= stressPenalty;
  p = clamp(p, 0.05, 0.98);
  
  // === 크게 개선된 희귀도별 난이도 ===
  const difficultyMultiplier = {
    Common: 1.15,    // 15% 보너스!
    Uncommon: 1.05,  // 5% 보너스
    Rare: 0.95,
    Epic: 0.85,
    Legendary: 0.75,
    Mythic: 0.65
  }[spec.rarity] || 1;
  
  p *= difficultyMultiplier;
  return Math.random() < p;
}

// 점수 계산
function computePoints(fish, castDistance) {
  const s = fish.spec;
  const sc = s.scoring;
  const wNorm = (fish.weight_kg - s.weight_kg.min) / (s.weight_kg.max - s.weight_kg.min);
  const szNorm = (fish.size_cm - s.size_cm.min) / (s.size_cm.max - s.size_cm.min);
  const distanceFactor = clamp(1.0 + 0.20 * (castDistance - settings.baseCast) / (settings.maxCast - settings.baseCast), 1.0, sc.distanceBonusCap || 1.20);
  const baseScore = s.basePoints * sc.rarityMult * Math.pow(1 + clamp(wNorm,0,1), sc.weightExp) * Math.pow(1 + clamp(szNorm,0,1), sc.sizeExp) * distanceFactor;
  const multiplier = Math.max(1, fish?.bonusMultiplier || 1);
  return Math.round(baseScore * multiplier);
}

// 라인 끊어짐 체크
function checkLineBreak(fish) {
  const s = fish.spec; 
  const eq = s.equipment;
  let penalty = 1.0;
  if (settings.rodTier < eq.recRodTier) penalty += 0.25 * (eq.recRodTier - settings.rodTier);
  if (settings.lineTier < eq.recLineTier) penalty += 0.35 * (eq.recLineTier - settings.lineTier);
  let chance = 0;
  if (fish.weight_kg > eq.breakRef_kg) {
    chance = 0.35 * (fish.weight_kg / eq.breakRef_kg) * penalty;
  }
  chance = clamp(chance, 0, 0.9);
  return Math.random() < chance;
}

// 활성 서클 해제
function releaseActiveCircle(active, applyRetreat = true) {
  if (!active) return;
  const fish = active.fish;
  if (fish) {
    if (fish.active === active) fish.active = null;
    fish.engaged = false;
    if (!fish.finished && applyRetreat) {
      const posY = fish.position?.y ?? fish.distance ?? 0;
      const posX = fish.position?.x ?? 0;
      const escape = Math.atan2(posY - world.bobberDist, posX) + Math.PI + rand(-0.45, 0.45);
      const speed = (fish.swimSpeed || 10) * rand(1.2, 1.6) * fish.personalityFactor;
      if (fish.targetVelocity) {
        fish.targetVelocity.x = Math.cos(escape) * speed;
        fish.targetVelocity.y = Math.sin(escape) * speed * 0.7;
      }
      fish.escapeTimer = rand(1.0, 2.0);
      fish.stressLevel = Math.min(1.0, fish.stressLevel + 0.3);
    }
  }
  active.life = 0;
}

// === 개선된 타이밍 서클 시스템 (미니맵과 동기화) ===
function updateActiveCircles(dt, bx, by, metrics, cameraY) {
  const pxPerMeter = metrics?.pxPerMeter || (canvas.clientHeight / Math.max(1, settings.maxCast));
  const baseLife = 1.8;
  const ctxInfo = resolveProjectionContext(metrics);
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const fish of world.fishes) {
    if (!fish || fish.finished) continue;

    const projection = resolveFishProjection(fish, metrics, cameraY, ctxInfo);
    if (!projection) continue;

    const centerY = projection.distanceMeters;
    const centerX = projection.lateralMeters;
    const range = DETECTION_RANGE_M; // 통합된 감지 범위
    
    const dy = centerY - world.bobberDist;
    const dx = centerX;
    const distToBobber = Math.sqrt(dx * dx + dy * dy);
    if (Number.isFinite(distToBobber)) {
      closestDistance = Math.min(closestDistance, distToBobber);
    }

    if (distToBobber <= range) {
      if (!fish.active) {
        const maxR = Math.max(24, range * pxPerMeter * 0.4);
        const minR = Math.max(12, maxR * 0.35);
        const shrinkRate = 15 + 20 * (fish.spec?.behavior?.circleShrinkRate ?? 1);
        const active = { fish, radius: maxR, maxR, minR, life: baseLife, range, shrinkRate, detectionRange: range };
        fish.engaged = true;
        fish.lastCircleTime = globalTime;
        fish.active = active;
        world.actives.push(active);
      } else {
        fish.active.range = range;
        fish.active.detectionRange = range;
        fish.engaged = true;
      }
    } else if (fish.active && distToBobber > range * 1.2) {
      fish.active.life = Math.min(fish.active.life, 0);
    } else if (!fish.active) {
      fish.engaged = false;
    }
  }

  const kept = [];
  for (const active of world.actives) {
    const fish = active.fish;
    if (!fish || fish.finished) {
      releaseActiveCircle(active, false);
      continue;
    }

    const projection = resolveFishProjection(fish, metrics, cameraY, ctxInfo);
    if (!projection) continue;

    const centerY = projection.distanceMeters;
    const centerX = projection.lateralMeters;
    const dy = centerY - world.bobberDist;
    const dx = centerX;
    const distToBobber = Math.sqrt(dx * dx + dy * dy);

    if (distToBobber > active.detectionRange * 1.3) {
      releaseActiveCircle(active, true);
      continue;
    }

    const proximityFactor = active.detectionRange > 0 ? clamp(1 - distToBobber / active.detectionRange, 0, 1) : 1;
    const targetRadius = lerp(active.maxR, active.minR, proximityFactor * 0.7);
    
    const blend = clamp(dt * 8, 0, 1);
    active.radius += (targetRadius - active.radius) * blend;
    active.radius = clamp(active.radius, active.minR, active.maxR);
    active.radius = Math.max(active.minR, active.radius - active.shrinkRate * dt);
    active.life -= dt;

    // 더 선명한 타이밍 서클 표시
    const alpha = clamp(active.life / baseLife, 0.3, 1.0);
    const pulseEffect = 1 + Math.sin(globalTime * 8) * 0.1;
    
    ctx.strokeStyle = fish.spec.ui.mapColorHex;
    ctx.lineWidth = 4 * pulseEffect;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); 
    ctx.arc(bx, by, active.radius, 0, Math.PI * 2); 
    ctx.stroke();
    
    // 성공 구간 표시
    if (active.radius <= active.minR + 8) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath(); 
      ctx.arc(bx, by, active.minR, 0, Math.PI * 2); 
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;

    if (active.life > 0 && active.radius > active.minR + 0.5) {
      kept.push(active);
    } else {
      releaseActiveCircle(active, true);
    }
  }
  world.actives = kept;
}

// 투영 컨텍스트 해결
function resolveProjectionContext(metrics) {
  const pxPerMeter = metrics?.pxPerMeter || (canvas.clientHeight / Math.max(1, settings.maxCast));
  const displayRange = Math.max(1, world.displayRange || world.lateralLimit || 5);
  const width = canvas.clientWidth;
  const centerX = width * 0.5;
  const pxPerMeterX = (width * 0.82) / (displayRange * 2);
  return { pxPerMeter, displayRange, pxPerMeterX, centerX, width };
}

// 물고기 투영 해결
function resolveFishProjection(fish, metrics, cameraY, ctxInfo) {
  if (!fish) return null;
  const distanceMeters = fish?.position?.y ?? fish?.distance;
  if (!Number.isFinite(distanceMeters)) return null;
  const lateralMeters = fish?.position?.x ?? 0;
  const pxPerMeter = ctxInfo.pxPerMeter || 1;
  const pxPerMeterX = ctxInfo.pxPerMeterX || 0;
  const worldY = metrics.waterSurfaceY - distanceMeters * pxPerMeter;
  const screenY = worldY + cameraY;
  const screenX = ctxInfo.centerX + lateralMeters * pxPerMeterX;

  let img = fish.image;
  if (!img) {
    const fishMap = gameData?.resources?.fish;
    if (fishMap?.get) {
      img = fishMap.get(fish.specId);
      if (img) fish.image = img;
    }
  }

  const scale = 1.0;
  const widthPx = (img ? img.width : 40) * scale;
  const heightPx = (img ? img.height : 24) * scale;

  const offscreenX = screenX < -ctxInfo.width * 0.35 || screenX > ctxInfo.width * 1.35;
  const offscreenY = screenY < -metrics.tileH * 2 || screenY > metrics.shorelineY + cameraY + metrics.tileH;
  const drawable = !offscreenX && !offscreenY && !!img;

  return {
    screenX, screenY, distanceMeters, lateralMeters, img, scale,
    radiusMeters: Math.max(widthPx, heightPx) * 0.5 / pxPerMeter,
    radiusPx: Math.max(widthPx, heightPx) * 0.5,
    widthPx, heightPx, pxPerMeter, pxPerMeterX, ctxInfo, drawable
  };
}