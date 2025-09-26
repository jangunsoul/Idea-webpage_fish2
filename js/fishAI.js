// === 물고기 AI 시스템 ===

// 물고기 움직임 편향 계산
function getFishMoveBias(spec) {
  const tag = spec?.behavior?.swimSpeed || 'Normal';
  if (tag === 'Fast') return 0.7;
  if (tag === 'Slow') return 0.4;
  return 0.55;
}

// 물고기 수영 속도 계산
function getFishSwimSpeed(spec, weightKg) {
  const tag = spec?.behavior?.swimSpeed || 'Normal';
  const base = FISH_SWIM_SPEED_TABLE[tag] ?? FISH_SWIM_SPEED_TABLE.Normal;
  const range = (spec?.weight_kg?.max ?? 0) - (spec?.weight_kg?.min ?? 0);
  const minW = spec?.weight_kg?.min ?? weightKg;
  const norm = range > 0 ? clamp((weightKg - minW) / range, 0, 1) : 0.5;
  const heavinessAdjust = lerp(1.15, 0.85, norm);
  return base * heavinessAdjust;
}

// 개선된 물고기 시뮬레이션
function updateFishSimulation(dt) {
  if (!world.fishes || !world.fishes.length) return;

  const bobberTarget = clamp(world.bobberDist, window.MIN_SINK_DISTANCE ?? 30, 200);
  const bobberPos = { x: 0, y: bobberTarget };
  const avoidanceRadius = window.FISH_AVOIDANCE_RADIUS ?? 12;
  const velocitySmooth = 1 - Math.pow(0.001, dt * 9);

  for (const fish of world.fishes) {
    if (!fish || fish.finished) continue;

    // 필수 속성 초기화
    if (!fish.position) fish.position = { x: 0, y: fish.distance ?? 30 };
    if (!fish.velocity) fish.velocity = { x: 0, y: 0 };
    if (!fish.targetVelocity) fish.targetVelocity = { x: 0, y: 0 };
    if (typeof fish.stressLevel !== 'number') fish.stressLevel = 0;
    if (typeof fish.personalityFactor !== 'number') fish.personalityFactor = rand(0.8, 1.2);
    if (typeof fish.escapeTimer !== 'number') fish.escapeTimer = 0;
    if (typeof fish.wanderTimer !== 'number') fish.wanderTimer = rand(0.6, 1.4);
    if (typeof fish.alertTimer !== 'number') fish.alertTimer = 0;
    if (!Number.isFinite(fish.homeY)) {
      fish.homeY = Number.isFinite(fish.distance) ? fish.distance : (fish.position?.y ?? window.world?.bobberDist ?? 30);
    }
    if (!Number.isFinite(fish.verticalRange)) {
      fish.verticalRange = window.FISH_VERTICAL_HOME_RANGE ?? 32;
    }

    fish.escapeTimer = Math.max(0, fish.escapeTimer - dt);
    fish.alertTimer = Math.max(0, fish.alertTimer - dt);
    if (fish.alertTimer <= 0 && fish.alertVector) {
      fish.alertVector = null;
    }

    const posX = fish.position.x;
    const posY = fish.position.y ?? fish.distance ?? bobberPos.y;
    const dx = posX - bobberPos.x;
    const dy = posY - bobberPos.y;
    const distToBobber = Math.sqrt(dx * dx + dy * dy);

    if (distToBobber < avoidanceRadius) {
      fish.stressLevel = Math.min(1, fish.stressLevel + dt * 0.45);
    } else {
      fish.stressLevel = Math.max(0, fish.stressLevel - dt * 0.2);
    }

    const swimSpeed = Math.max(0.5, (fish.swimSpeed || 8) * fish.personalityFactor);
    const wanderSpeed = swimSpeed * 0.6;
    let desiredVX = fish.targetVelocity.x || 0;
    let desiredVY = fish.targetVelocity.y || 0;

    if (fish.alertTimer > 0 && fish.alertVector) {
      const scatterSpeed = Math.max(swimSpeed, 0);
      desiredVX = fish.alertVector.x * scatterSpeed;
      desiredVY = fish.alertVector.y * scatterSpeed * 0.7;
      fish.moving = true;
      fish.escapeTimer = Math.max(fish.escapeTimer, fish.alertTimer);
    } else {
      fish.wanderTimer -= dt;
      if (fish.wanderTimer <= 0 || (!fish.moving && Math.random() < 0.4)) {
        fish.wanderTimer = rand(0.8, 1.8);
        if (Math.random() < (fish.moveBias || 0.5)) {
          const angle = Math.random() * Math.PI * 2;
          desiredVX = Math.cos(angle) * wanderSpeed;
          desiredVY = Math.sin(angle) * wanderSpeed * 0.55;
        } else {
          desiredVX = 0;
          desiredVY = 0;
        }
      }

      if (distToBobber < avoidanceRadius) {
        const awayX = dx / (distToBobber || 1);
        const awayY = dy / (distToBobber || 1);
        const avoidSpeed = swimSpeed * (0.8 + fish.stressLevel * 0.6);
        desiredVX = awayX * avoidSpeed;
        desiredVY = awayY * avoidSpeed * 0.75;
        fish.wanderTimer = Math.min(fish.wanderTimer, 0.5);
      } else if (fish.escapeTimer > 0) {
        const awayX = Math.sign(dx || (Math.random() - 0.5));
        desiredVX = awayX * swimSpeed * 0.9;
        desiredVY *= 0.7;
      }
    }

    fish.targetVelocity.x = desiredVX;
    fish.targetVelocity.y = desiredVY;

    fish.velocity.x += (fish.targetVelocity.x - fish.velocity.x) * velocitySmooth;
    fish.velocity.y += (fish.targetVelocity.y - fish.velocity.y) * velocitySmooth;

    if (Math.abs(fish.velocity.x) > 0.05) {
      fish.facingRight = fish.velocity.x > 0;
    }

    fish.position.x += fish.velocity.x * dt;
    fish.position.y += fish.velocity.y * dt;

    // 경계 처리
    let clamped = false;
    let horizontalBounce = false;
    const globalMinY = 30;
    const globalMaxY = 200;
    const computedHomeY = fish.homeY ?? fish.position.y ?? fish.distance ?? globalMinY;
    const clampedHomeY = clamp(computedHomeY, globalMinY, globalMaxY);
    fish.homeY = clampedHomeY;
    const baseVerticalRange = fish.verticalRange ?? (window.FISH_VERTICAL_HOME_RANGE ?? 32);
    const escapeMultiplier = fish.escapeTimer > 0 ? (window.FISH_VERTICAL_ESCAPE_MULT ?? 1.9) : 1;
    const permittedRange = Math.max(8, baseVerticalRange * escapeMultiplier);
    const minY = clamp(clampedHomeY - permittedRange, globalMinY, globalMaxY);
    const maxY = clamp(clampedHomeY + permittedRange, globalMinY, globalMaxY);
    if (fish.position.y < minY) { fish.position.y = minY; clamped = true; }
    if (fish.position.y > maxY) { fish.position.y = maxY; clamped = true; }
    const lateralLimit = Math.max(1, world.lateralLimit || 5);
    if (fish.position.x < -lateralLimit) { fish.position.x = -lateralLimit; clamped = true; horizontalBounce = true; }
    if (fish.position.x > lateralLimit) { fish.position.x = lateralLimit; clamped = true; horizontalBounce = true; }

    if (horizontalBounce) {
      const direction = fish.position.x > 0 ? -1 : 1;
      const bounceSpeed = Math.max(3, Math.abs(fish.velocity.x) * 0.5 + swimSpeed * 0.6);
      fish.targetVelocity.x = direction * bounceSpeed;
      fish.velocity.x = fish.targetVelocity.x;
      fish.moving = true;
    }

    if (clamped && !horizontalBounce) {
      fish.targetVelocity.x *= -0.3;
      fish.targetVelocity.y *= -0.3;
    }

    const speedSq = fish.velocity.x * fish.velocity.x + fish.velocity.y * fish.velocity.y;
    if (speedSq < 0.01) {
      if (!fish.moving || (fish.targetVelocity.x === 0 && fish.targetVelocity.y === 0)) {
        fish.velocity.x = 0;
        fish.velocity.y = 0;
      }
    }

    fish.moving = speedSq > 0.04;
    fish.distance = fish.position.y;
  }
}