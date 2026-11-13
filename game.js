const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hpEl = document.getElementById('hpValue');
const ammoEl = document.getElementById('ammoValue');
const enemiesEl = document.getElementById('enemyValue');
const messageBox = document.getElementById('messageBox');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rand = (min, max) => Math.random() * (max - min) + min;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const normalizeAngle = (angle) => {
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
};

const FOV = Math.PI / 3;
const MAX_DEPTH = 24;
const MAP_COLS = 16;
const MAP_ROWS = 16;

const state = {
  time: 0,
  running: true,
  won: false,
  gameOver: false,
  messageTimer: 0,
  keys: Object.create(null),
  pointerLock: false,
  player: {
    x: 1.5,
    y: 1.5,
    radius: 0.22,
    hp: 100,
    ammo: 0,
    angle: Math.PI / 4,
    fireCooldown: 0,
    flash: 0,
    dodge: 0
  },
  bullets: [],
  enemyBullets: [],
  enemies: [],
  particles: [],
  pickup: null,
  exit: null,
  map: null
};

function setMessage(text, duration = 1800) {
  messageBox.textContent = text;
  messageBox.classList.add('visible');
  state.messageTimer = duration;
}

function buildMap() {
  const map = Array.from({ length: MAP_ROWS }, (_, y) =>
    Array.from({ length: MAP_COLS }, (_, x) =>
      x === 0 || y === 0 || x === MAP_COLS - 1 || y === MAP_ROWS - 1 ? 1 : 0
    )
  );

  // Scattered cover keeps the arena readable while leaving every objective reachable.
  const cover = [
    [3, 4], [8, 3], [11, 5],
    [3, 8], [7, 7], [11, 9],
    [5, 11], [9, 12]
  ];
  for (const [x, y] of cover) map[y][x] = 1;

  return map;
}

function resetGame() {
  state.map = buildMap();
  state.running = true;
  state.won = false;
  state.gameOver = false;
  state.player.x = 1.5;
  state.player.y = 1.5;
  state.player.hp = 100;
  state.player.angle = Math.PI / 4;
  state.player.ammo = 0;
  state.player.fireCooldown = 0;
  state.player.flash = 0;
  state.bullets = [];
  state.enemyBullets = [];
  state.particles = [];
  state.enemies = [
    { x: 6.5, y: 3.5, hp: 35, speed: 0.8, radius: 0.28, attackCooldown: 1.0 },
    { x: 11.5, y: 5.5, hp: 40, speed: 0.85, radius: 0.28, attackCooldown: 0.7 },
    { x: 9.5, y: 10.5, hp: 50, speed: 0.8, radius: 0.3, attackCooldown: 1.2 },
    { x: 12.5, y: 12.5, hp: 45, speed: 0.9, radius: 0.3, attackCooldown: 0.9 }
  ];
  state.pickup = { x: 13.5, y: 12.5, radius: 0.24, collected: false };
  state.exit = { x: 13.5, y: 2.5, radius: 0.4, unlocked: false };
  setMessage('Find the lost bullet', 2000);
  updateHud();
}

function updateHud() {
  hpEl.textContent = String(Math.max(0, Math.ceil(state.player.hp)));
  ammoEl.textContent = String(state.player.ammo);
  enemiesEl.textContent = String(state.enemies.length);
}

function isWall(x, y) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX < 0 || cellY < 0 || cellX >= MAP_COLS || cellY >= MAP_ROWS) return true;
  return state.map[cellY][cellX] === 1;
}

function canMoveTo(x, y, radius = 0.25) {
  const checks = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius]
  ];
  return !checks.some(([cx, cy]) => isWall(cx, cy));
}

function castRay(angle) {
  let distance = 0;
  while (distance < MAX_DEPTH) {
    const x = state.player.x + Math.cos(angle) * distance;
    const y = state.player.y + Math.sin(angle) * distance;
    if (isWall(x, y)) {
      return { distance, x, y };
    }
    distance += 0.04;
  }
  return { distance: MAX_DEPTH, x: state.player.x + Math.cos(angle) * MAX_DEPTH, y: state.player.y + Math.sin(angle) * MAX_DEPTH };
}

function addParticles(x, y, count, color = '#ffd166') {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: rand(-1.2, 1.2),
      vy: rand(-1.2, 1.2),
      life: rand(0.2, 0.8),
      color
    });
  }
}

function fireBullet() {
  if (!state.running || state.player.fireCooldown > 0) return;
  if (state.player.ammo <= 0) {
    setMessage('No bullets left', 750);
    return;
  }

  const shotAngle = state.player.angle;
  state.bullets.push({
    x: state.player.x + Math.cos(shotAngle) * 0.5,
    y: state.player.y + Math.sin(shotAngle) * 0.5,
    vx: Math.cos(shotAngle) * 7.5,
    vy: Math.sin(shotAngle) * 7.5,
    life: 0.9,
    radius: 0.09,
    damage: 35
  });
  state.player.ammo -= 1;
  state.player.fireCooldown = 0.18;
  addParticles(state.player.x + Math.cos(shotAngle) * 0.6, state.player.y + Math.sin(shotAngle) * 0.6, 6, '#ffd166');
  updateHud();
}

function damagePlayer(amount) {
  state.player.hp = Math.max(0, state.player.hp - amount);
  state.player.flash = 0.32;
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    state.running = false;
    setMessage('You were overrun', 3000);
  }
}

function updatePlayer(dt) {
  const player = state.player;
  const forward = (state.keys.KeyW || state.keys.ArrowUp ? 1 : 0) - (state.keys.KeyS || state.keys.ArrowDown ? 1 : 0);
  const strafe = (state.keys.KeyD || state.keys.ArrowRight ? 1 : 0) - (state.keys.KeyA || state.keys.ArrowLeft ? 1 : 0);

  let moveX = 0;
  let moveY = 0;

  if (forward !== 0 || strafe !== 0) {
    const len = Math.hypot(forward, strafe) || 1;
    const nx = (Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe) / len;
    const ny = (Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe) / len;
    moveX = nx * 2.4 * dt;
    moveY = ny * 2.4 * dt;
  }

  const nextX = player.x + moveX;
  const nextY = player.y + moveY;
  if (canMoveTo(nextX, player.y, player.radius)) player.x = nextX;
  if (canMoveTo(player.x, nextY, player.radius)) player.y = nextY;

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.flash = Math.max(0, player.flash - dt);

}

function updateBullets(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || isWall(bullet.x, bullet.y)) {
      addParticles(bullet.x, bullet.y, 5, '#ffce66');
      state.bullets.splice(i, 1);
      continue;
    }

    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = state.enemies[j];
      if (dist(bullet.x, bullet.y, enemy.x, enemy.y) <= bullet.radius + enemy.radius) {
        enemy.hp -= bullet.damage;
        addParticles(bullet.x, bullet.y, 12, '#ffcf7a');
        state.bullets.splice(i, 1);
        if (enemy.hp <= 0) {
          state.enemies.splice(j, 1);
          addParticles(enemy.x, enemy.y, 22, '#ff8c69');
        }
        break;
      }
    }
  }

  for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.enemyBullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || isWall(bullet.x, bullet.y)) {
      state.enemyBullets.splice(i, 1);
      continue;
    }

    if (dist(bullet.x, bullet.y, state.player.x, state.player.y) <= 0.25 + bullet.radius) {
      damagePlayer(bullet.damage);
      state.enemyBullets.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  for (const enemy of state.enemies) {
    const dx = state.player.x - enemy.x;
    const dy = state.player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    enemy.attackCooldown -= dt;

    if (d > 0.8) {
      const stepX = (dx / d) * enemy.speed * dt;
      const stepY = (dy / d) * enemy.speed * dt;
      const testX = enemy.x + stepX;
      const testY = enemy.y + stepY;
      if (canMoveTo(testX, enemy.y, enemy.radius)) enemy.x = testX;
      if (canMoveTo(enemy.x, testY, enemy.radius)) enemy.y = testY;
    }

    if (d < 3.2 && enemy.attackCooldown <= 0) {
      const angle = Math.atan2(dy, dx);
      state.enemyBullets.push({
        x: enemy.x + Math.cos(angle) * 0.35,
        y: enemy.y + Math.sin(angle) * 0.35,
        vx: Math.cos(angle) * 4.0,
        vy: Math.sin(angle) * 4.0,
        life: 2.5,
        radius: 0.09,
        damage: 12
      });
      enemy.attackCooldown = rand(1.1, 1.8);
    }

    if (d < 0.5 + enemy.radius + state.player.radius) {
      damagePlayer(18 * dt);
    }
  }
}

function updatePickup() {
  if (!state.pickup || state.pickup.collected) return;
  if (dist(state.player.x, state.player.y, state.pickup.x, state.pickup.y) < 0.5) {
    state.player.ammo = 1;
    state.pickup.collected = true;
    state.exit.unlocked = true;
    setMessage('Bullet recovered', 1600);
    updateHud();
  }
}

function updateExit() {
  if (!state.exit || !state.exit.unlocked) return;
  if (dist(state.player.x, state.player.y, state.exit.x, state.exit.y) < 0.6) {
    state.won = true;
    state.running = false;
    setMessage('Escape successful', 3200);
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.life <= 0) state.particles.splice(i, 1);
  }
}

function update(dt) {
  if (!state.running) {
    if (state.messageTimer > 0) {
      state.messageTimer -= dt * 1000;
      if (state.messageTimer <= 0) messageBox.classList.remove('visible');
    }
    return;
  }

  state.time += dt;
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateParticles(dt);
  updatePickup();
  updateExit();

  if (!state.pickup.collected && dist(state.player.x, state.player.y, state.pickup.x, state.pickup.y) < 3.5) {
    setMessage('Recover the bullet', 500);
  }

  if (state.player.hp <= 0) {
    state.gameOver = true;
    state.running = false;
  }

  if (state.messageTimer > 0) {
    state.messageTimer -= dt * 1000;
    if (state.messageTimer <= 0) messageBox.classList.remove('visible');
  }

  updateHud();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height / 2);
  sky.addColorStop(0, '#657d8f');
  sky.addColorStop(1, '#1d2c3d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height / 2);

  const floor = ctx.createLinearGradient(0, canvas.height / 2, 0, canvas.height);
  floor.addColorStop(0, '#1d1e22');
  floor.addColorStop(1, '#090b0e');
  ctx.fillStyle = floor;
  ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2);
}

function drawWalls() {
  const depthBuffer = new Array(canvas.width);
  for (let column = 0; column < canvas.width; column += 2) {
    const rayAngle = state.player.angle - FOV / 2 + (column / canvas.width) * FOV;
    const hit = castRay(rayAngle);
    depthBuffer[column] = hit.distance;
    depthBuffer[column + 1] = hit.distance;

    const corrected = Math.max(0.1, hit.distance * Math.cos(rayAngle - state.player.angle));
    const wallHeight = clamp((canvas.height / corrected) * 0.8, 0, canvas.height * 0.9);
    const top = (canvas.height - wallHeight) / 2;
    const shade = clamp(255 - hit.distance * 18, 40, 220);

    ctx.fillStyle = `rgb(${shade}, ${shade * 0.9}, ${shade * 0.75})`;
    ctx.fillRect(column, top, 2, wallHeight);
  }
  return depthBuffer;
}

function drawSprite(sprite, color, size, distance, angle) {
  const screenX = canvas.width / 2 + Math.tan(angle) * (canvas.width / (2 * Math.tan(FOV / 2)));
  const screenY = canvas.height / 2;
  const spriteSize = clamp((canvas.height / distance) * size, 8, canvas.height * 0.75);
  const half = spriteSize / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(screenX, screenY, half, 0, Math.PI * 2);
  ctx.fill();
}

function drawSprites(depthBuffer) {
  const sprites = [];

  for (const enemy of state.enemies) {
    const dx = enemy.x - state.player.x;
    const dy = enemy.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) - state.player.angle;
    const normalized = normalizeAngle(angle);
    if (Math.abs(normalized) < FOV + 0.6 && distance > 0.2) {
      sprites.push({ type: 'enemy', x: enemy.x, y: enemy.y, distance, angle: normalized, radius: 0.3, color: '#ff6b5f' });
    }
  }

  if (!state.pickup.collected) {
    const dx = state.pickup.x - state.player.x;
    const dy = state.pickup.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    const angle = normalizeAngle(Math.atan2(dy, dx) - state.player.angle);
    if (Math.abs(angle) < FOV + 0.6 && distance > 0.2) {
      sprites.push({ type: 'pickup', x: state.pickup.x, y: state.pickup.y, distance, angle, radius: 0.25, color: '#ffe16b' });
    }
  }

  if (state.exit.unlocked) {
    const dx = state.exit.x - state.player.x;
    const dy = state.exit.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    const angle = normalizeAngle(Math.atan2(dy, dx) - state.player.angle);
    if (Math.abs(angle) < FOV + 0.6 && distance > 0.2) {
      sprites.push({ type: 'exit', x: state.exit.x, y: state.exit.y, distance, angle, radius: 0.4, color: '#6df7b2' });
    }
  }

  sprites.sort((a, b) => b.distance - a.distance);

  for (const sprite of sprites) {
    const screenX = canvas.width / 2 + Math.tan(sprite.angle) * (canvas.width / (2 * Math.tan(FOV / 2)));
    const spriteSize = clamp((canvas.height / sprite.distance) * 0.8, 14, 220);
    const centerX = screenX;
    const centerY = canvas.height / 2;
    const xStart = centerX - spriteSize / 2;
    const xEnd = centerX + spriteSize / 2;
    const inFront = sprite.distance < depthBuffer[Math.min(canvas.width - 1, Math.max(0, Math.round(centerX)))];

    if (!inFront) continue;

    if (sprite.type === 'enemy') {
      ctx.fillStyle = sprite.color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, spriteSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sprite.type === 'pickup') {
      ctx.fillStyle = '#ffe16b';
      ctx.beginPath();
      ctx.arc(centerX, centerY, spriteSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(centerX - 3, centerY - spriteSize * 0.65, 6, spriteSize * 1.3);
    }

    if (sprite.type === 'exit') {
      ctx.fillStyle = '#73f6bd';
      ctx.beginPath();
      ctx.arc(centerX, centerY, spriteSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c0ffe4';
      ctx.lineWidth = 3;
      ctx.strokeRect(centerX - spriteSize * 0.35, centerY - spriteSize * 0.35, spriteSize * 0.7, spriteSize * 0.7);
    }
  }
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = particle.life * 1.4;
    ctx.fillRect(
      canvas.width / 2 + (particle.x - state.player.x) * 70,
      canvas.height / 2 + (particle.y - state.player.y) * 70,
      4,
      4
    );
    ctx.globalAlpha = 1;
  }
}

function drawGun() {
  const x = canvas.width / 2;
  const y = canvas.height - 60;
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 42, y - 12, 84, 42);
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 16, y - 48, 32, 56);
  ctx.fillStyle = '#8b9197';
  ctx.fillRect(x - 6, y - 88, 12, 42);
}

function drawHud() {
  if (!state.exit.unlocked) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - 270, 18, 250, 64);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Objective: find bullet', canvas.width - 250, 52);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width - 260, 18, 240, 64);
    ctx.fillStyle = '#7df7c7';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Objective: escape', canvas.width - 240, 52);
  }

  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('Game Over', canvas.width / 2 - 120, canvas.height / 2 - 12);
    ctx.font = '22px sans-serif';
    ctx.fillText('Press R to restart', canvas.width / 2 - 110, canvas.height / 2 + 32);
  }

  if (state.won) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9dffd2';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('Area Secured', canvas.width / 2 - 170, canvas.height / 2 - 12);
    ctx.font = '22px sans-serif';
    ctx.fillText('Press R to restart', canvas.width / 2 - 110, canvas.height / 2 + 32);
  }
}

function render() {
  drawBackground();
  const depthBuffer = drawWalls();
  drawSprites(depthBuffer);
  drawParticles();
  drawGun();
  drawHud();

  if (state.player.flash > 0) {
    ctx.fillStyle = `rgba(255, 79, 79, ${state.player.flash * 0.8})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

let lastFrame = 0;
function frame(timestamp) {
  const dt = Math.min(0.033, (timestamp - lastFrame) / 1000 || 0.016);
  lastFrame = timestamp;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function handlePointerMove(event) {
  if (document.pointerLockElement === canvas) {
    state.player.angle = normalizeAngle(state.player.angle + event.movementX * 0.003);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  state.player.angle = Math.atan2(y - 0.5, x - 0.5);
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR') {
    resetGame();
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    fireBullet();
    return;
  }
  if (event.code === 'KeyE') {
    updatePickup();
    return;
  }
  state.keys[event.code] = true;
});

window.addEventListener('keyup', (event) => {
  delete state.keys[event.code];
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 0) {
    fireBullet();
    canvas.requestPointerLock();
  }
});

canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
window.addEventListener('pointerlockchange', () => {
  state.pointerLock = document.pointerLockElement === canvas;
});

const touchButtons = document.querySelectorAll('#touchControls button');
touchButtons.forEach((button) => {
  const code = button.dataset.key;
  const press = (event) => {
    event.preventDefault();
    state.keys[code] = true;
    if (code === 'Space') fireBullet();
  };
  const release = () => {
    delete state.keys[code];
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('pointercancel', release);
});

resetGame();
requestAnimationFrame(frame);
