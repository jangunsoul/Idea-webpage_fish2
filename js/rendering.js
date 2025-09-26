// === 렌더링 시스템 ===

// 환경 메트릭스 계산
function getEnvironmentMetrics(W, H) {
  const fallbackTile = 40;
  const resolvedTileW = (Number.isFinite(environmentState.tileWidth) && environmentState.tileWidth > 0) 
    ? environmentState.tileWidth 
    : (environmentState.shore ? environmentState.shore.width : fallbackTile);
  const resolvedTileH = (Number.isFinite(environmentState.tileHeight) && environmentState.tileHeight > 0) 
    ? environmentState.tileHeight 
    : (environmentState.shore ? environmentState.shore.height : fallbackTile);
    
  const tileW = Math.max(1, Math.round(resolvedTileW));
  const tileH = Math.max(1, Math.round(resolvedTileH));
  const configuredStrips = Math.max(1, Math.floor(environmentState.landRows || 3));
  const desiredLand = tileH * configuredStrips;
  const minLand = tileH * 2;
  const minWater = Math.max(tileH * 3, 160);
  const landHeight = Math.min(Math.max(minLand, desiredLand), Math.max(minLand, H - minWater));
  const shorelineY = Math.max(0, H - landHeight);
  
  let waterSurfaceY = shorelineY - Math.min(tileH * 0.6, 48);
  waterSurfaceY = Math.min(waterSurfaceY, shorelineY - 4);
  waterSurfaceY = Math.max(20, waterSurfaceY);
  if (shorelineY < 24) waterSurfaceY = Math.max(4, shorelineY * 0.6);

  const topMargin = Math.max(tileH * 1.5, Math.min(shorelineY * 0.45, 160));
  const targetBobberY = Math.min(shorelineY - tileH * 1.4, Math.max(topMargin + tileH * 2, H * 0.35));
  const available = Math.max(tileH * 2, shorelineY - topMargin);
  const minScrollRange = H * 3;
  let pxPerMeter = available / Math.max(1, settings.maxCast);
  if (pxPerMeter * settings.maxCast < minScrollRange) pxPerMeter = minScrollRange / Math.max(1, settings.maxCast);
  
  const distancePxRange = pxPerMeter * settings.maxCast;
  const minBaseY = waterSurfaceY - distancePxRange;
  const maxScroll = Math.max(0, targetBobberY - minBaseY);
  const bobberOffsetX = Math.max(4, (characterSprite.scale || 2) * 1.2);
  const flightArc = Math.min(shorelineY * 0.45, tileH * 5.5);

  return {
    tileW, tileH, landHeight, shorelineY, waterSurfaceY, topMargin, targetBobberY,
    pxPerMeter, distancePxRange, maxScroll, bobberOffsetX, flightArc, landStrips: configuredStrips
  };
}

// 환경 그리기
function drawEnvironment(W, H, metrics, cameraY) {
  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, W, H);

  const tileW = Math.max(1, Math.round(metrics.tileW));
  const tileH = Math.max(1, Math.round(metrics.tileH));
  const shorelineY = metrics.shorelineY;
  const firstWaterY = Math.floor((-cameraY - tileH * 2) / tileH) * tileH;

  // 물 그리기
  for (let worldY = firstWaterY; worldY < shorelineY; worldY += tileH) {
    const screenY = worldY + cameraY;
    if (screenY > H) break;
    drawWaterRow(screenY, tileW, tileH, W);
  }

  // 육지 그리기
  const landLayers = Math.max(1, Math.ceil(metrics.landHeight / tileH));
  let worldY = shorelineY;
  for (let layer = 0; layer < landLayers + 2; layer++) {
    const screenY = worldY + cameraY;
    drawLandRow(screenY, tileW, tileH, W, layer === 0);
    worldY += tileH;
    if (screenY > H + tileH) break;
  }
}

// 물 행 그리기
function drawWaterRow(y, tileW, tileH, width) {
  if (environmentState.water) {
    for (let x = -tileW; x < width + tileW; x += tileW) {
      ctx.drawImage(environmentState.water, x, y, tileW, tileH);
    }
  } else {
    const grd = ctx.createLinearGradient(0, y, 0, y + tileH);
    grd.addColorStop(0, getCssVar('--water1'));
    grd.addColorStop(1, getCssVar('--water2'));
    ctx.fillStyle = grd;
    ctx.fillRect(0, y, width, tileH);
  }
}

// 육지 행 그리기
function drawLandRow(y, tileW, tileH, width, shoreline) {
  const img = shoreline ? environmentState.shore : (environmentState.land || environmentState.shore);
  if (img) {
    for (let x = -tileW; x < width + tileW; x += tileW) {
      ctx.drawImage(img, x, y, tileW, tileH);
    }
  } else {
    ctx.fillStyle = shoreline ? '#28351f' : '#1b2416';
    ctx.fillRect(0, y, width, tileH);
  }
}

// 캐릭터 애니메이션 업데이트
function updateCharacterAnimation(dt) {
  const sprite = characterSprite;
  if (!sprite) return;

  const sequence = Array.isArray(sprite.castSequence) ? sprite.castSequence : [];
  const frameDuration = typeof sprite.frameDuration === 'number' && sprite.frameDuration > 0 
    ? sprite.frameDuration : 0.1;

  if (sprite.playing && sequence.length) {
    sprite.timer += dt;
    if (sprite.timer >= frameDuration) {
      sprite.timer -= frameDuration;
      sprite.animationIndex++;
      if (sprite.animationIndex >= sequence.length) {
        sprite.playing = false;
        const hold = sprite.holdFrame ?? sprite.postCastFrame;
        if (typeof hold === 'number') sprite.currentFrame = hold;
      } else {
        const next = sequence[sprite.animationIndex];
        if (typeof next === 'number') sprite.currentFrame = next;
      }
    }
  } else if (sprite.playing && !sequence.length) {
    sprite.playing = false;
    const hold = sprite.holdFrame ?? sprite.postCastFrame;
    if (typeof hold === 'number') sprite.currentFrame = hold;
  } else if (state === GameState.Idle || state === GameState.Targeting) {
    sprite.currentFrame = sprite.idleFrame || 0;
  }
}

function drawCharacterPlatform(charBaseX, charWidth, footY, metrics) {
  const dock = environmentState.dock;
  if (!dock) return;
  const tileH = Math.max(1, metrics.tileH);
  const baseScale = (tileH * 1.05) / Math.max(1, dock.height);
  const baseDestH = dock.height * baseScale;
  const topY = footY - baseDestH + tileH * 0.12;
  const scale = baseScale * 3;
  const destH = dock.height * scale;
  const destW = dock.width * scale;
  const centerX = charBaseX + charWidth * 0.5;
  const destX = centerX - destW * 0.5;
  const destY = topY;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(dock, destX, destY, destW, destH);
  ctx.restore();
}

// 캐릭터 스프라이트 그리기
function drawCharacterSprite(W, H, metrics, cameraY) {
  const sprite = characterSprite;
  const scale = sprite.scale || 2;
  const frameW = sprite.frameWidth;
  const frameH = sprite.frameHeight;
  const destW = frameW * scale;
  const destH = frameH * scale;
  const charBaseX = W * 0.5 - destW * 0.5;
  baseX = charBaseX;
  const baseY = metrics.shorelineY + metrics.tileH * 0.2 - destH;
  const drawY = baseY + cameraY;

  drawCharacterPlatform(charBaseX, destW, drawY + destH, metrics);

  if (sprite.image) {
    const index = Math.max(0, Math.min(sprite.frameCount - 1, Math.floor(sprite.currentFrame)));
    const sx = index * frameW;
    ctx.drawImage(sprite.image, sx, 0, frameW, frameH, charBaseX, drawY, destW, destH);
  } else {
    // 폴백 사각형
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(charBaseX + destW/2 - 18, drawY + destH - 60, 36, 24);
    ctx.fillRect(charBaseX + destW/2 - 22, drawY + destH - 36, 44, 60);
  }

  const anchor = sprite.lineAnchor || { x: frameW - 6, y: frameH * 0.5 };
  const spriteScale = sprite.scale || scale;
  rodAnchor.x = baseX + anchor.x * spriteScale;
  rodAnchor.y = drawY + anchor.y * spriteScale;
}

// 낚싯줄 그리기
function drawFishingLine(ax, ay, bx, by) {
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const sway = Math.sin(globalTime * 2.1) * 8;
  const ctrlX = ax + sway;
  const ctrlY = Math.min(ay - Math.max(60, Math.abs(by - ay) * 0.6), by - 18);
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(ctrlX, ctrlY, bx, by - 6);
  ctx.stroke();
}

// 찌 그리기
function drawBobber(x, y) {
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y - 2, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBobberWaveEffect(W, metrics, lateralScale) {
  const effect = waveEffect;
  if (!effect || !effect.playing || !effect.image) return;
  const cols = Math.max(1, Math.floor(effect.sheetColumns || 1));
  const rows = Math.max(1, Math.floor(effect.sheetRows || Math.ceil(effect.frameCount / cols)));
  const frameW = effect.frameWidth || Math.floor(effect.image.width / cols);
  const frameH = effect.frameHeight || Math.floor(effect.image.height / rows);
  if (!frameW || !frameH) return;
  const frameIndex = Math.max(0, Math.min(effect.frameCount - 1, Math.floor(effect.frameIndex)));
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const sx = col * frameW;
  const sy = row * frameH;
  const distancePx = effect.distance * metrics.pxPerMeter;
  const worldY = metrics.waterSurfaceY - distancePx;
  const screenY = worldY + camera.y;
  const lateral = effect.lateral || 0;
  const screenX = W * 0.5 + metrics.bobberOffsetX + lateral * lateralScale;
  const baseScale = Math.min(1.45, Math.max(0.6, (metrics.tileW * 1.2) / Math.max(1, frameW)));
  const scale = baseScale * 6;
  const destW = frameW * scale;
  const destH = frameH * scale;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(effect.image, sx, sy, frameW, frameH, screenX - destW / 2, screenY - destH / 2, destW, destH);
  ctx.restore();
}

function drawBobberWaveEffect(W, metrics, lateralScale) {
  const effect = waveEffect;
  if (!effect || !effect.playing || !effect.image) return;
  const cols = Math.max(1, Math.floor(effect.sheetColumns || 1));
  const rows = Math.max(1, Math.floor(effect.sheetRows || Math.ceil(effect.frameCount / cols)));
  const frameW = effect.frameWidth || Math.floor(effect.image.width / cols);
  const frameH = effect.frameHeight || Math.floor(effect.image.height / rows);
  if (!frameW || !frameH) return;
  const frameIndex = Math.max(0, Math.min(effect.frameCount - 1, Math.floor(effect.frameIndex)));
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const sx = col * frameW;
  const sy = row * frameH;
  const distancePx = effect.distance * metrics.pxPerMeter;
  const worldY = metrics.waterSurfaceY - distancePx;
  const screenY = worldY + camera.y;
  const lateral = effect.lateral || 0;
  const screenX = W * 0.5 + metrics.bobberOffsetX + lateral * lateralScale;
  const baseScale = Math.min(1.45, Math.max(0.6, (metrics.tileW * 1.2) / Math.max(1, frameW)));
  const scale = baseScale * 3;
  const destW = frameW * scale;
  const destH = frameH * scale;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(effect.image, sx, sy, frameW, frameH, screenX - destW / 2, screenY - destH / 2, destW, destH);
  ctx.restore();
}
function drawBobberWaveEffect(W, metrics, lateralScale) {
  const effect = waveEffect;
  if (!effect || !effect.playing || !effect.image) return;
  const cols = Math.max(1, Math.floor(effect.sheetColumns || 1));
  const rows = Math.max(1, Math.floor(effect.sheetRows || Math.ceil(effect.frameCount / cols)));
  const frameW = effect.frameWidth || Math.floor(effect.image.width / cols);
  const frameH = effect.frameHeight || Math.floor(effect.image.height / rows);
  if (!frameW || !frameH) return;
  const frameIndex = Math.max(0, Math.min(effect.frameCount - 1, Math.floor(effect.frameIndex)));
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const sx = col * frameW;
  const sy = row * frameH;
  const distancePx = effect.distance * metrics.pxPerMeter;
  const worldY = metrics.waterSurfaceY - distancePx;
  const screenY = worldY + camera.y;
  const lateral = effect.lateral || 0;
  const screenX = W * 0.5 + metrics.bobberOffsetX + lateral * lateralScale;
  const baseScale = Math.min(1.45, Math.max(0.6, (metrics.tileW * 1.2) / Math.max(1, frameW)));
  const scale = baseScale * 3;
  const destW = frameW * scale;
  const destH = frameH * scale;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(effect.image, sx, sy, frameW, frameH, screenX - destW / 2, screenY - destH / 2, destW, destH);
  ctx.restore();
}

function drawBobberWaveEffect(W, metrics, lateralScale) {
  const effect = waveEffect;
  if (!effect || !effect.playing || !effect.image) return;
  const cols = Math.max(1, Math.floor(effect.sheetColumns || 1));
  const rows = Math.max(1, Math.floor(effect.sheetRows || Math.ceil(effect.frameCount / cols)));
  const frameW = effect.frameWidth || Math.floor(effect.image.width / cols);
  const frameH = effect.frameHeight || Math.floor(effect.image.height / rows);
  if (!frameW || !frameH) return;
  const frameIndex = Math.max(0, Math.min(effect.frameCount - 1, Math.floor(effect.frameIndex)));
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const sx = col * frameW;
  const sy = row * frameH;
  const distancePx = effect.distance * metrics.pxPerMeter;
  const worldY = metrics.waterSurfaceY - distancePx;
  const screenY = worldY + camera.y;
  const lateral = effect.lateral || 0;
  const screenX = W * 0.5 + metrics.bobberOffsetX + lateral * lateralScale;
  const scale = Math.min(1.45, Math.max(0.6, (metrics.tileW * 1.2) / Math.max(1, frameW)));
  const destW = frameW * scale;
  const destH = frameH * scale;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(effect.image, sx, sy, frameW, frameH, screenX - destW / 2, screenY - destH / 2, destW, destH);
  ctx.restore();
}

// 카메라 업데이트
function updateCamera(distance, metrics, dt, state) {
  const distancePx = clamp(distance * metrics.pxPerMeter, 0, metrics.distancePxRange);
  const baseY = metrics.waterSurfaceY - distancePx;
  let desired = 0;
  if (state === GameState.Targeting) {
    desired = clamp(metrics.targetBobberY - baseY, 0, metrics.maxScroll);
  }
  const smoothing = 1 - Math.pow(0.001, dt * 9);
  camera.y += (desired - camera.y) * smoothing;
  camera.y = clamp(camera.y, 0, metrics.maxScroll);
  return { distancePx, baseY };
}