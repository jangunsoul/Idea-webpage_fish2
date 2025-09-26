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

// 군집 행동 계산
function calculateSchoolForces(fish, allFishes) {
  const pos = fish.position;
  const neighbors = [];
  
  for (const other of allFishes) {
    if (other === fish || !other.position) continue;
    const dx = other.position.x - pos.x;
    const dy = other.position.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < FISH_SCHOOLING_RADIUS) {
      neighbors.push({ fish: other, distance: dist, dx, dy });
    }
  }
  
  if (neighbors.length === 0) {
    return { separation: { x: 0, y: 0 }, cohesion: { x: 0, y: 0 }, alignment: { x: 0, y: 0 } };
  }
  
  // 분리력 (Separation)
  let sepX = 0, sepY = 0;
  let sepCount = 0;
  
  for (const neighbor of neighbors) {
    if (neighbor.distance < FISH_SCHOOLING_RADIUS * 0.5) {
      const force = 1 / (neighbor.distance + 0.1);
      sepX -= neighbor.dx * force;
      sepY -= neighbor.dy * force;
      sepCount++;
    }
  }
  
  if (sepCount > 0) {
    sepX /= sepCount;
    sepY /= sepCount;
  }
  
  // 응집력 (Cohesion)
  let cohX = 0, cohY = 0;
  for (const neighbor of neighbors) {
    cohX += neighbor.fish.position.x;
    cohY += neighbor.fish.position.y;
  }
  cohX = cohX / neighbors.length - pos.x;
  cohY = cohY / neighbors.length - pos.y;
  
  // 정렬력 (Alignment)
  let aliX = 0, aliY = 0;
  for (const neighbor of neighbors) {
    const vel = neighbor.fish.velocity || { x: 0, y: 0 };
    aliX += vel.x;
    aliY += vel.y;
  }
  aliX /= neighbors.length;
  aliY /= neighbors.length;
  
  return {
    separation: { x: sepX, y: sepY },
    cohesion: { x: cohX, y: cohY },
    alignment: { x: aliX, y: aliY }
  };
}

// 회피 행동 계산
function calculateAvoidanceForce(fish, bobberPos) {
  const pos = fish.position;
  const dx = pos.x - bobberPos.x;
  const dy = pos.y - bobberPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist > FISH_AVOIDANCE_RADIUS) {
    return { x: 0, y: 0 };
  }
  
  const force = (FISH_AVOIDANCE_RADIUS - dist) / FISH_AVOIDANCE_RADIUS;
  const normalizedX = dx / (dist + 0.1);
  const normalizedY = dy / (dist + 0.1);
  
  return {
    x: normalizedX * force * FISH_AVOIDANCE_FORCE,
    y: normalizedY * force * FISH_AVOIDANCE_FORCE
  };
}

// 방황 행동 계산
function calculateWanderForce(fish, time) {
  const fishId = fish.specId ? fish.specId.charCodeAt(0) : 1;
  const wanderAngle = time * 0.5 + fishId * 0.1;
  const wanderRadius = 0.3;
  
  return {
    x: Math.cos(wanderAngle) * wanderRadius,
    y: Math.sin(wanderAngle) * wanderRadius * 0.7
  };
}

// 개선된 물고기 시뮬레이션
function updateFishSimulation(dt) {
  if (!world.fishes || !world.fishes.length) return;
  
  const bobberTarget = clamp(world.bobberDist, window.MIN_SINK_DISTANCE ?? 30, 200);
  const velocitySmooth = 1 - Math.pow(0.001, dt * 9);
  const bobberPos = { x: 0, y: bobberTarget };
  
  for (const fish of world.fishes) {
    if (!fish || fish.finished) continue;

    // 필수 속성 초기화
    if (!fish.position) fish.position = { x: 0, y: fish.distance ?? 30 };
    if (!fish.velocity) fish.velocity = { x: 0, y: 0 };
    if (!fish.targetVelocity) fish.targetVelocity = { x: 0, y: 0 };
    if (typeof fish.stressLevel !== 'number') fish.stressLevel = 0;
    if (typeof fish.personalityFactor !== 'number') fish.personalityFactor = rand(0.8, 1.2);
    if (typeof fish.escapeTimer !== 'number') fish.escapeTimer = 0;
    
    fish.escapeTimer = Math.max(0, fish.escapeTimer - dt);
    
    // 찌와의 거리에 따른 스트레스 계산
    const distToBobber = Math.sqrt(
      Math.pow(fish.position.x - bobberPos.x, 2) + 
      Math.pow(fish.position.y - bobberPos.y, 2)
    );
    
    if (distToBobber < FISH_AVOIDANCE_RADIUS) {
      fish.stressLevel = Math.min(1.0, fish.stressLevel + dt * 0.3);
    } else {
      fish.stressLevel = Math.max(0, fish.stressLevel - dt * 0.1);
    }

    // AI 기반 움직임 결정 (2% 확률로 업데이트)
    if (Math.random() < 0.02) {
      const schoolForces = calculateSchoolForces(fish, world.fishes);
      const avoidanceForce = calculateAvoidanceForce(fish, bobberPos);
      const wanderForce = calculateWanderForce(fish, globalTime);
      
      // 상황에 따른 가중치 조정
      let schoolWeight = fish.escapeTimer > 0 ? 0.1 : 0.6;
      let avoidanceWeight = fish.escapeTimer > 0 ? 1.2 : (fish.stressLevel * 0.8 + 0.2);
      let wanderWeight = fish.escapeTimer > 0 ? 0.1 : (1 - fish.stressLevel * 0.3);
      
      schoolWeight *= fish.personalityFactor;
      wanderWeight *= fish.personalityFactor;
      
      // 최종 방향 계산
      let finalX = 0, finalY = 0;
      
      finalX += schoolForces.separation.x * FISH_SEPARATION_FORCE * schoolWeight;
      finalY += schoolForces.separation.y * FISH_SEPARATION_FORCE * schoolWeight;
      
      finalX += schoolForces.cohesion.x * FISH_COHESION_FORCE * schoolWeight;
      finalY += schoolForces.cohesion.y * FISH_COHESION_FORCE * schoolWeight;
      
      finalX += schoolForces.alignment.x * FISH_ALIGNMENT_FORCE * schoolWeight;
      finalY += schoolForces.alignment.y * FISH_ALIGNMENT_FORCE * schoolWeight;
      
      finalX += avoidanceForce.x * avoidanceWeight;
      finalY += avoidanceForce.y * avoidanceWeight;

      finalX += wanderForce.x * FISH_WANDER_FORCE * wanderWeight;
      finalY += wanderForce.y * FISH_WANDER_FORCE * wanderWeight;

      const lateralSpan = Math.max(1, world.lateralLimit || 5);
      const centerStrength = (window.FISH_CENTERING_FORCE ?? 0.35) * (fish.personalityFactor ?? 1);
      const normalizedX = clamp(fish.position.x / lateralSpan, -1, 1);
      finalX += -normalizedX * centerStrength * (1.2 + Math.abs(normalizedX) * 1.1);

      // 속도 정규화 및 적용
      const magnitude = Math.sqrt(finalX * finalX + finalY * finalY);
      if (magnitude > 0.1) {
        const speed = (fish.swimSpeed || 8) * fish.personalityFactor * (0.6 + fish.stressLevel * 0.4);
        fish.targetVelocity.x = (finalX / magnitude) * speed;
        fish.targetVelocity.y = (finalY / magnitude) * speed * 0.7; // 수직 움직임 제한
        fish.moving = true;
      } else {
        // 가끔 정지
        if (Math.random() > (fish.moveBias || 0.5)) {
          fish.targetVelocity.x = 0;
          fish.targetVelocity.y = 0;
          fish.moving = false;
        }
      }
    }
    
    // 속도 스무딩
    fish.velocity.x += (fish.targetVelocity.x - fish.velocity.x) * velocitySmooth;
    fish.velocity.y += (fish.targetVelocity.y - fish.velocity.y) * velocitySmooth;

    if (Math.abs(fish.velocity.x) > 0.05) {
      fish.facingRight = fish.velocity.x > 0;
    }

    // 위치 업데이트
    fish.position.x += fish.velocity.x * dt;
    fish.position.y += fish.velocity.y * dt;
    
    // 경계 처리
    let clamped = false;
    let horizontalBounce = false;
    if (fish.position.y < 30) { fish.position.y = 30; clamped = true; }
    if (fish.position.y > 200) { fish.position.y = 200; clamped = true; }
    const lateralLimit = Math.max(1, world.lateralLimit || 5);
    if (fish.position.x < -lateralLimit) { fish.position.x = -lateralLimit; clamped = true; horizontalBounce = true; }
    if (fish.position.x > lateralLimit) { fish.position.x = lateralLimit; clamped = true; horizontalBounce = true; }

    if (horizontalBounce) {
      const direction = fish.position.x > 0 ? -1 : 1;
      const desiredSpeed = Math.max(Math.abs(fish.targetVelocity.x), fish.swimSpeed || 6) * 0.9;
      const speed = Math.max(3, desiredSpeed);
      fish.targetVelocity.x = direction * speed;
      fish.velocity.x = fish.targetVelocity.x;
      fish.moving = true;
    }

    if (clamped && !horizontalBounce) {
      fish.targetVelocity.x *= -0.3;
      fish.targetVelocity.y *= -0.3;
    }
    
    // 거의 정지한 경우 완전 정지
    const speedSq = fish.velocity.x * fish.velocity.x + fish.velocity.y * fish.velocity.y;
    if (speedSq < 0.01 && !fish.moving) {
      fish.velocity.x = 0;
      fish.velocity.y = 0;
    }
    
    fish.distance = fish.position.y;
  }
}