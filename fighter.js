// Konoha Arena — 1 on 1 arcade fighter.
// Art: sprite-gen atlases under sprites/, generated stage and FX under assets/.

const W = 960, H = 540;
const FLOOR_Y = 452;
const FIGHTER_H = 188;                 // drawn height of a standing fighter
const FOOT_RATIO = 0.90625;            // every sprite-gen cell puts feet here
const STAND_RATIO = 470 / 640;         // standing content height / cell height

const GRAVITY = 2400;
const WALK_SPEED = 205;
const JUMP_V = 760;
const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const MAX_ROUNDS = 5;        // hard cap so repeated draws cannot loop forever
const MAX_HP = 100, MAX_METER = 100;
const INFINITE_METER = true;   // specials are free; set false to restore meter cost

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const boot = document.getElementById('boot');

// ---------------------------------------------------------------- audio

// Compact procedural SFX keep the game self-contained. Browsers require audio
// to be unlocked by a player gesture, so the first key press starts the mixer.
let audioCtx = null;
function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function noiseBuffer(seconds) {
  if (!audioCtx) return null;
  const length = Math.ceil(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = last * .72 + (Math.random() * 2 - 1) * .28;
    data[i] = last;
  }
  return buffer;
}

function playFogSfx(duration = 2.1) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  src.buffer = noiseBuffer(duration);
  filter.type = 'bandpass'; filter.frequency.value = 720; filter.Q.value = .55;
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.16, now + .12);
  gain.gain.setValueAtTime(.13, now + Math.max(.13, duration - .35));
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(now); src.stop(now + duration);
}

function playDozerSfx() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime, duration = 2.65;
  const engine = audioCtx.createOscillator();
  const rumble = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  engine.type = 'sawtooth'; engine.frequency.setValueAtTime(72, now);
  engine.frequency.linearRampToValueAtTime(54, now + duration);
  rumble.type = 'square'; rumble.frequency.value = 34;
  filter.type = 'lowpass'; filter.frequency.value = 260;
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.13, now + .08);
  gain.gain.setValueAtTime(.11, now + duration - .35);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  engine.connect(filter); rumble.connect(filter); filter.connect(gain).connect(audioCtx.destination);
  engine.start(now); rumble.start(now);
  engine.stop(now + duration); rumble.stop(now + duration);
}

const voiceSfx = {
  summon: new Audio('assets/audio/rahul-summon.mp3'),
  ohiya: new Audio('assets/audio/rahul-oh-iya-bang.mp3'),
};
for (const clip of Object.values(voiceSfx)) { clip.preload = 'auto'; clip.volume = .92; }

function playVoiceSfx(id) {
  const source = voiceSfx[id];
  if (!source) return;
  // A fresh node allows two Rahuls to use the same move without cutting the
  // first voice line short.
  const clip = source.cloneNode();
  clip.volume = source.volume;
  clip.play().catch(() => {});
}

// Keep the 960x540 game coordinate system while rendering to a dense backing
// buffer. The selection screen stays crisp on Retina and 4K displays.
const DPR = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.scale(DPR, DPR);

// ---------------------------------------------------------------- roster

const ROSTER = [
  {
    id: 'sawit', name: 'SAWIT MAN', run: 'sprites/sawit-villain/run',
    portrait: 'assets/ui/sawit-villain-portrait.png',
    full: 'assets/ui/sawit-villain-full.png',
    selectPreview: 'assets/ui/sawit-select-preview.png',
    selectFacing: 1,
    tint: '#e8a33a',
    stats: { POWER: 5, SPEED: 4, TECHNIQUE: 4, DEFENSE: 3 },
    blurb: 'Plantation tyrant',
    specials: [
      { key: 'kebun', name: 'SAWIT EXPANSION', cost: 50, kind: 'dozer' },
      { key: 'kabut', name: 'KABUT ASAP', cost: 50, kind: 'fog' },
    ],
  },
  {
    id: 'belantara', name: 'BELANTARA', run: 'sprites/tree-monster/run',
    portrait: 'assets/ui/tree-monster-portrait.png',
    full: 'assets/ui/tree-monster-full.png',
    selectPreview: 'assets/ui/belantara-select-preview.png',
    selectFacing: -1,
    tint: '#6fbf4a',
    stats: { POWER: 5, SPEED: 3, TECHNIQUE: 3, DEFENSE: 5 },
    blurb: 'Guardian of the forest',
    specials: [
      { key: 'akar', name: 'AKAR MAUT', cost: 50, kind: 'roots' },
    ],
  },
  {
    id: 'rahul', name: 'RAHUL', run: 'sprites/rahul/run',
    portrait: 'assets/ui/rahul-portrait.png',
    full: 'assets/ui/rahul-full.png',
    selectPreview: 'assets/ui/rahul-select-preview.png',
    selectFacing: 1,
    battleScale: .68,
    tint: '#f0b53b',
    stats: { POWER: 3, SPEED: 5, TECHNIQUE: 5, DEFENSE: 3 },
    blurb: 'Viral village fighter',
    specials: [
      { key: 'rahul', name: 'RAHULLLL! SUMMON', cost: 50, kind: 'summon', dur: .9,
        cutin: 'shout', cutinArt: 'cutinOld',
        cutinText: 'RAHULLL~', cutinHue: '#2f9ede' },
      { key: 'ohiya', name: 'OH IYA BANG!', cost: 50, kind: 'ohiya', anim: 'ohiya', dur: 1.2, spawnAt: 1.0,
        shout: 'OH IYA BANG!', shoutAt: .62,
        cutin: 'wave', cutinText: 'OHH IYA BANG!', cutinHue: '#f0a02e' },
    ],
  },
];

// ---------------------------------------------------------------- loading

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image failed: ' + src));
    i.src = src;
  });
}
async function loadRun(dir) {
  const m = await fetch(dir + '/manifest.json').then(r => {
    if (!r.ok) throw new Error('manifest failed: ' + dir);
    return r.json();
  });
  return { atlas: await loadImage(dir + '/sprite-sheet-alpha.png'), layout: m.frame_layout, anim: m.animation };
}

const art = {};
async function loadAll() {
  for (const c of ROSTER) {
    c.art = await loadRun(c.run);
    c.portraitImg = await loadImage(c.portrait);
    c.fullImg = await loadImage(c.full);
    c.selectPreviewImg = await loadImage(c.selectPreview);
  }
  const [arena, dozer, fog, keyArt, selectBg, rahulMob, impactBurst, dustWave, hoe] = await Promise.all([
    loadImage('assets/stage/ikn-arena-hd.png'),
    loadImage('assets/fx/bulldozer.png'),
    loadImage('assets/fx/fog.png'),
    loadImage('assets/ui/key-art.png'),
    loadImage('assets/ui/select-arena-hd.png'),
    loadImage('assets/fx/rahul-mob.png'),
    loadImage('assets/fx/impact-burst.png'),
    loadImage('assets/fx/dust-wave.png'),
    loadImage('assets/fx/hoe.png'),
  ]);
  art.mini = await loadRun('sprites/rahul-mini/run');
  art.cutin = await loadRun('sprites/rahul-cutin/run');
  art.cutinOld = await loadRun('sprites/oldman-cutin/run');
  Object.assign(art, { arena, dozer, fog, keyArt, selectBg, rahulMob, impactBurst, dustWave, hoe });
}

// ---------------------------------------------------------------- sprites

class Anim {
  constructor(run, st) { this.run = run; this.set(st, true); }
  set(st, force) {
    if (!this.run.anim.rows[st]) st = 'idle';
    if (!force && this.state === st) return;
    this.state = st; this.frame = 0; this.t = 0; this.finished = false;
  }
  get spec() { return this.run.anim.rows[this.state]; }
  update(dt) {
    const s = this.spec;
    const d = (s.durations_ms ? s.durations_ms[this.frame] : 1000 / s.fps) / 1000;
    this.t += dt;
    while (this.t >= d) {
      this.t -= d;
      if (this.frame < s.frames - 1) this.frame++;
      else if (s.loop) this.frame = 0;
      else { this.finished = true; break; }
    }
  }
  rect() { return this.run.layout.rows[this.state][this.frame]; }
}

// Tinting has to happen on a scratch canvas. 'source-atop' composites against
// whatever is already on the target, and the stage is opaque, so tinting
// directly on the main canvas paints a solid rectangle instead of the sprite.
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d');

/** Draw a sprite cell with the subject's feet planted at (footX, footY). */
function drawCell(run, rect, footX, footY, drawH, flip, alpha = 1, tint = null) {
  const cw = run.layout.cellWidth, ch = run.layout.cellHeight;
  const dh = drawH, dw = dh * (cw / ch);
  const dx = footX - dw / 2, dy = footY - dh * FOOT_RATIO;

  let src = run.atlas, sx = rect.x, sy = rect.y, sw = rect.w, sh = rect.h;
  if (tint) {
    if (scratch.width !== rect.w || scratch.height !== rect.h) {
      scratch.width = rect.w; scratch.height = rect.h;
    }
    sctx.clearRect(0, 0, rect.w, rect.h);
    sctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(run.atlas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    sctx.globalCompositeOperation = 'source-atop';   // clipped to the sprite's own alpha
    sctx.fillStyle = tint;
    sctx.fillRect(0, 0, rect.w, rect.h);
    sctx.globalCompositeOperation = 'source-over';
    src = scratch; sx = 0; sy = 0;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  if (flip) { ctx.translate(dx + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(dx + dw / 2), 0); }
  ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}

// ---------------------------------------------------------------- input

const keys = new Set();
const CONTROLS = {
  0: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', block: 'KeyS', light: 'KeyF', heavy: 'KeyG', s1: 'KeyQ', s2: 'KeyE' },
  1: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', block: 'ArrowDown', light: 'KeyJ', heavy: 'KeyK', s1: 'KeyU', s2: 'KeyI' },
};
const pressed = new Set();             // edge-triggered this frame
addEventListener('keydown', e => {
  unlockAudio();
  if (e.repeat) return;
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  // Snapshot the screen so one confirmation press cannot both finish character
  // selection and immediately skip the VS cinematic in the same key event.
  const inputScreen = screen;
  if (inputScreen === 'title' || inputScreen === 'result') {
    if (e.code === 'Enter' || e.code === 'Space') advance();
  } else if (inputScreen === 'select') {
    selectKey(e.code);
  } else if (inputScreen === 'vs' && (e.code === 'Enter' || e.code === 'Space')) {
    startBattle();
  }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('pointerdown', () => Sound.unlock());
const held = (p, a) => keys.has(CONTROLS[p][a]);
const tapped = (p, a) => pressed.has(CONTROLS[p][a]);

// ---------------------------------------------------------------- fighters

function makeFighter(def, side) {
  return {
    def, side,                          // side 0 = left, 1 = right
    x: side === 0 ? 260 : W - 260, y: FLOOR_Y,
    vx: 0, vy: 0, facing: side === 0 ? 1 : -1,
    hp: MAX_HP, meter: INFINITE_METER ? MAX_METER : 0,
    state: 'idle', stateT: 0, attackKind: null, hasHit: false,
    hitstun: 0, blockstun: 0, invuln: 0, flash: 0,
    anim: new Anim(def.art, 'idle'),
    wins: 0, cpu: false,
  };
}

const HITBOX_W = 66;
const body = f => ({ x: f.x - HITBOX_W / 2, y: f.y - FIGHTER_H, w: HITBOX_W, h: FIGHTER_H });

const ATTACKS = {
  light: { startup: 0.10, active: 0.12, recover: 0.16, dmg: 6,  reach: 96,  kb: 150, meter: 8 },
  heavy: { startup: 0.20, active: 0.14, recover: 0.30, dmg: 13, reach: 118, kb: 320, meter: 12 },
};

function attackBox(f) {
  const a = ATTACKS[f.attackKind];
  const w = a.reach;
  return {
    x: f.facing > 0 ? f.x + 16 : f.x - 16 - w,
    y: f.y - FIGHTER_H * 0.78, w, h: FIGHTER_H * 0.5,
  };
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function canAct(f) {
  return f.hitstun <= 0 && f.blockstun <= 0 &&
         f.state !== 'attack' && f.state !== 'special' && f.state !== 'ko';
}

function startAttack(f, kind) {
  Sound.sfx('whoosh');
  f.state = 'attack'; f.attackKind = kind; f.stateT = 0; f.hasHit = false;
  f.anim.set('attack', true);
}

const STICKER_DUR = 1.15;

function startSpecial(f, sp) {
  if (!INFINITE_METER) {
    if (f.meter < sp.cost) return false;
    f.meter -= sp.cost;
  }
  if (f.def.id === 'rahul') playVoiceSfx(sp.kind);
  // The showcase rides along above the caster — it never pauses the match.
  Sound.sfx('special');
  if (sp.cutin) Sound.sfx('sticker');
  const cutRun = art[sp.cutinArt || 'cutin'];
  if (sp.cutin && cutRun && cutRun.anim.rows[sp.cutin]) {
    projectiles.push({ kind: 'sticker', owner: f, sp, run: cutRun, vx: 0, dir: f.facing,
                       x: f.x, y: FLOOR_Y, t: 0, life: STICKER_DUR,
                       anim: new Anim(cutRun, sp.cutin) });
  }
  beginSpecial(f, sp);
  return true;
}

function beginSpecial(f, sp) {
  // hasHit gates the one-shot projectile spawn; a stale true from the previous
  // attack would eat the meter and spawn nothing.
  f.state = 'special'; f.stateT = 0; f.specialDef = sp; f.hasHit = false;
  f.anim.set(sp.anim || 'attack', true);
  // The sticker already shouts the move name above the caster; a banner and a
  // speech balloon on top of it is three callouts for one move.
  if (sp.shout && !sp.cutin) {
    projectiles.push({ kind: 'shout', text: sp.shout, owner: f, dir: f.facing,
                       x: f.x, y: FLOOR_Y, vx: 0, t: 0, delay: sp.shoutAt ?? 0,
                       life: (sp.shoutAt ?? 0) + .6 });
  }
  if (!sp.cutin) announce(sp.name, f.def.tint);
}

function damage(target, amount, kb, attacker) {
  if (target.state === 'ko') return;
  const blocking = target.blockHeld && target.onGroundNow !== false &&
                   ((target.x < attacker.x && target.facing > 0) || (target.x > attacker.x && target.facing < 0));
  if (blocking) {
    target.hp -= amount * 0.22;
    target.blockstun = 0.18;
    target.vx = Math.sign(target.x - attacker.x) * kb * 0.35;
    target.meter = Math.min(MAX_METER, target.meter + 4);
    Sound.sfx('block');
    spark(target.x + (attacker.x < target.x ? -30 : 30), target.y - FIGHTER_H * 0.55, '#9fd8ff');
  } else {
    target.hp -= amount;
    target.hitstun = 0.32;
    target.flash = 0.18;
    target.vx = Math.sign(target.x - attacker.x || 1) * kb;
    target.state = 'hurt'; target.anim.set('hurt', true);
    target.meter = Math.min(MAX_METER, target.meter + 6);
    attacker.meter = Math.min(MAX_METER, attacker.meter + (ATTACKS[attacker.attackKind]?.meter ?? 10));
    Sound.sfx(kb > 250 ? 'hitHeavy' : 'hitLight');
    spark(target.x + (attacker.x < target.x ? -34 : 34), target.y - FIGHTER_H * 0.6, '#ffd257');
    shake(kb > 250 ? 10 : 6);
  }
  if (target.hp <= 0) { target.hp = 0; koTriggered(target); }
}

// ---------------------------------------------------------------- effects

let projectiles = [], sparks = [], shakeT = 0, shakeMag = 0, banner = null;

function burst(x, y, scale = 1) {
  projectiles.push({ kind: 'burst', x, y, life: .42, t: 0, scale,
                     spin: (Math.random() - .5) * .5, owner: null, vx: 0, dir: 1 });
}

/** Jagged comic shout balloon — the arcade "big studio" look the flat oval misses. */
function shoutBubble(cx, cy, text, tailDir, k, size = 26) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.font = `italic 900 ${size}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const rx = tw / 2 + 34, ry = size * 1.18;

  const spikes = 18;
  ctx.beginPath();
  for (let i = 0; i <= spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const jag = i % 2 === 0 ? 1 : 0.8;
    ctx.lineTo(Math.cos(a) * rx * jag, Math.sin(a) * ry * jag);
  }
  ctx.closePath();
  ctx.fillStyle = '#fdfdfb';
  ctx.strokeStyle = '#08090d'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  ctx.stroke(); ctx.fill();

  ctx.beginPath();                                   // tail toward the speaker
  ctx.moveTo(tailDir * rx * 0.34, ry * 0.7);
  ctx.lineTo(tailDir * rx * 0.30, ry * 2.0);
  ctx.lineTo(tailDir * rx * 0.74, ry * 0.62);
  ctx.closePath();
  ctx.fillStyle = '#fdfdfb'; ctx.stroke(); ctx.fill();

  ctx.lineWidth = 7; ctx.strokeStyle = '#08090d';
  ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, '#ffe98a'); g.addColorStop(.5, '#ffb01f'); g.addColorStop(1, '#e8520f');
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  ctx.restore();
}

function spark(x, y, color) {
  for (let i = 0; i < 10; i++) {
    sparks.push({ x, y, vx: (Math.random() - .5) * 420, vy: (Math.random() - .7) * 340, t: 0, life: .3 + Math.random() * .2, color });
  }
}
function shake(m) { shakeMag = Math.max(shakeMag, m); shakeT = 0.28; }
function announce(text, color) { banner = { text, color, t: 0 }; }

function spawnSpecial(f, kind) {
  const dir = f.facing;
  if (kind === 'dozer') {
    Sound.sfx('dozer');
    playDozerSfx();
    projectiles.push({ kind, x: f.x - dir * 210, y: FLOOR_Y, vx: dir * 430, dir, owner: f, hit: new Set(), life: 3.2, t: 0, dmg: 22, kb: 430 });
  } else if (kind === 'fog') {
    Sound.sfx('fog');
    playFogSfx(2.1);
    const foe = other(f);
    projectiles.push({ kind, x: foe.x, y: FLOOR_Y, vx: dir * 26, dir, owner: f, life: 2.1, t: 0, tick: 0, dmg: 3.4, kb: 60 });
  } else if (kind === 'roots') {
    Sound.sfx('roots');
    projectiles.push({ kind, x: f.x + dir * 70, y: FLOOR_Y, vx: dir * 520, dir, owner: f, hit: new Set(), life: 1.4, t: 0, dmg: 17, kb: 360 });
  } else if (kind === 'summon') {
    Sound.sfx('swarm');
    const foe = other(f);
    // Controller owns the damage cadence; the minis are the performance.
    projectiles.push({ kind, x: foe.x, y: FLOOR_Y, vx: 0, dir, owner: f, life: 2.5, t: 0,
      hits: 0, cool: .5, dmg: 3, kb: 55, kbFinal: 340 });
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      projectiles.push({ kind: 'mini', owner: f, dir, t: 0, life: 2.4,
        delay: i * .09,
        ox: side * (34 + (i >> 1) * 30) + (Math.random() - .5) * 14,
        oy: -((i * 37) % 62),
        face: -side,                       // each mini turns in toward the victim
        scale: .92 + Math.random() * .22,
        anim: new Anim(art.mini, 'gang') });
      projectiles[projectiles.length - 1].anim.frame = i % 6;   // desynchronise the flurry
    }
    shake(9);
  } else if (kind === 'ohiya') {
    // the hoe leaves his hand on the throw beat and flies on its own
    Sound.sfx('throwHoe');
    projectiles.push({ kind: 'hoe', x: f.x + dir * 54, y: FLOOR_Y - FIGHTER_H * .52,
      vx: dir * 660, dir, owner: f, life: 2, t: 0, hit: false, dmg: 21, kb: 470 });
    shake(8);
  }
}

function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.t += dt; p.life -= dt;
    // Pure decoration: no owner, no target, nothing to resolve. Must bail out
    // before other() runs, which dereferences owner.side.
    if (p.kind === 'sticker') { p.anim.update(dt); continue; }
    if (p.kind === 'burst' || p.kind === 'shout') continue;
    const foe = other(p.owner);
    if (p.kind === 'summon') {
      p.x = foe.x;
      p.cool -= dt;
      if (p.cool <= 0 && p.hits < 6 && foe.state !== 'ko') {
        p.hits++; p.cool = .26;
        const last = p.hits === 6;
        damage(foe, p.dmg, last ? p.kbFinal : p.kb, p.owner);
        if (last) { burst(foe.x, foe.y - FIGHTER_H * .55, 1.05); shake(13); }
      }
      continue;
    }
    if (p.kind === 'mini') { p.anim.update(dt); continue; }
    if (p.kind === 'hoe') {
      p.x += p.vx * dt;
      p.spin = (p.spin || 0) + dt * 15 * p.dir;
      if (!p.hit && overlap({ x: p.x - 34, y: p.y - 34, w: 68, h: 68 }, body(foe)) && foe.state !== 'ko') {
        p.hit = true; p.life = 0;
        damage(foe, p.dmg, p.kb, p.owner);
        burst(foe.x, foe.y - FIGHTER_H * .55, 1.15);
        shake(16);
      }
      if (p.x < -90 || p.x > W + 90) p.life = 0;
      continue;
    }
    if (p.kind === 'rahul-mob') {
      if (p.t < p.delay) continue;
      p.x += p.vx * dt;
      p.cool -= dt;
      const box = { x: p.x - 150, y: FLOOR_Y - 180, w: 300, h: 180 };
      if (p.cool <= 0 && p.hits < 3 && overlap(box, body(foe)) && foe.state !== 'ko') {
        p.hits++; p.cool = .15;
        const last = p.hits === 3;
        damage(foe, p.dmg, last ? p.kbFinal : p.kb, p.owner);
        if (last) { burst(foe.x, foe.y - FIGHTER_H * .55, 1); shake(14); }
      }
      if (p.x < -620 || p.x > W + 620) p.life = 0;
      continue;
    }
    if (p.kind === 'rahul-clone' && p.t < p.delay) continue;
    p.x += p.vx * dt;
    if (p.kind === 'fog') {
      p.tick -= dt;
      const box = { x: p.x - 150, y: FLOOR_Y - 210, w: 300, h: 210 };
      if (p.tick <= 0 && overlap(box, body(foe)) && foe.state !== 'ko') {
        p.tick = 0.5;
        damage(foe, p.dmg, p.kb, p.owner);
      }
    } else {
      const box = p.kind === 'dozer'
        ? { x: p.x - 105, y: FLOOR_Y - 130, w: 210, h: 130 }
        : { x: p.x - 40, y: FLOOR_Y - 90, w: 80, h: 90 };
      if (!p.hit.has(foe) && overlap(box, body(foe)) && foe.state !== 'ko') {
        p.hit.add(foe);
        damage(foe, p.dmg, p.kb, p.owner);
        if (p.kind === 'roots' || p.kind === 'rahul-clone') p.life = 0;
      }
    }
    if (p.x < -320 || p.x > W + 320) p.life = 0;
  }
  projectiles = projectiles.filter(p => p.life > 0);

  for (const s of sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; }
  sparks = sparks.filter(s => s.t < s.life);
  if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
  if (banner) { banner.t += dt; if (banner.t > 1.5) banner = null; }
}

// ---------------------------------------------------------------- match

let fighters = [], screen = 'title', mode = 'cpu', roundNo = 1, timer = ROUND_TIME;
let titleT = 0, menuIdx = 0;   // presentation clock + menu cursor
let roundState = 'intro', roundT = 0, matchWinner = null;
const other = f => fighters[f.side === 0 ? 1 : 0];

function koTriggered(loser) {
  loser.state = 'ko'; loser.anim.set('hurt', true);
  loser.vx = Math.sign(loser.x - other(loser).x || 1) * 260;
  if (roundState === 'fight') {
    roundState = 'ko'; roundT = 0;
    const w = other(loser); w.wins++;
    announce('K.O.', '#ff6b4a');
    Sound.sfx('ko');
    shake(16);
  }
}

function resetRound() {
  for (const f of fighters) {
    f.x = f.side === 0 ? 260 : W - 260; f.y = FLOOR_Y;
    f.vx = 0; f.vy = 0; f.hp = MAX_HP;
    if (INFINITE_METER) f.meter = MAX_METER;
    f.state = 'idle'; f.anim.set('idle', true);
    f.hitstun = 0; f.blockstun = 0; f.flash = 0; f.facing = f.side === 0 ? 1 : -1;
  }
  projectiles = []; sparks = [];
  timer = ROUND_TIME; roundState = 'intro'; roundT = 0;
  Sound.sfx('roundStart');
}

function updateFighter(f, dt) {
  const p = f.side;
  f.stateT += dt;
  f.hitstun = Math.max(0, f.hitstun - dt);
  f.blockstun = Math.max(0, f.blockstun - dt);
  f.flash = Math.max(0, f.flash - dt);

  const onGround = f.y >= FLOOR_Y - 0.5;
  f.onGroundNow = onGround;
  const live = roundState === 'fight' && f.state !== 'ko';

  let inLeft = false, inRight = false, wantJump = false, wantBlock = false;
  let wantLight = false, wantHeavy = false, wantS1 = false, wantS2 = false;

  if (live && !f.cpu) {
    inLeft = held(p, 'left'); inRight = held(p, 'right');
    wantJump = tapped(p, 'jump'); wantBlock = held(p, 'block');
    wantLight = tapped(p, 'light'); wantHeavy = tapped(p, 'heavy');
    wantS1 = tapped(p, 's1'); wantS2 = tapped(p, 's2');
  } else if (live && f.cpu) {
    const c = cpuThink(f, dt);
    ({ inLeft, inRight, wantJump, wantBlock, wantLight, wantHeavy, wantS1, wantS2 } = c);
  }

  f.blockHeld = wantBlock && onGround && canAct(f);

  // face the opponent while grounded and free
  const foe = other(f);
  if (onGround && canAct(f)) f.facing = foe.x >= f.x ? 1 : -1;

  if (canAct(f) && live) {
    if (wantS1 && f.def.specials[0]) startSpecial(f, f.def.specials[0]);
    else if (wantS2 && f.def.specials[1]) startSpecial(f, f.def.specials[1]);
    else if (wantHeavy) startAttack(f, 'heavy');
    else if (wantLight) startAttack(f, 'light');
    else {
      if (f.blockHeld) { f.vx = 0; f.state = 'block'; }
      else {
        const dir = (inRight ? 1 : 0) - (inLeft ? 1 : 0);
        f.vx = dir * WALK_SPEED;
        if (onGround && wantJump) { f.vy = -JUMP_V; f.state = 'jump'; Sound.sfx('jump'); }
        else if (onGround) f.state = dir !== 0 ? 'walk' : 'idle';
      }
    }
  }

  // attack timing
  if (f.state === 'attack') {
    const a = ATTACKS[f.attackKind];
    f.vx *= 0.82;
    const t = f.stateT;
    if (t > a.startup && t < a.startup + a.active && !f.hasHit) {
      if (overlap(attackBox(f), body(foe)) && foe.state !== 'ko') {
        f.hasHit = true;
        damage(foe, a.dmg, a.kb, f);
      }
    }
    if (t > a.startup + a.active + a.recover) { f.state = 'idle'; f.attackKind = null; }
  }

  if (f.state === 'special') {
    f.vx *= 0.7;
    const sd = f.specialDef;
    if (f.stateT > (sd.spawnAt ?? 0.22) && !f.hasHit) { f.hasHit = true; spawnSpecial(f, sd.kind); }
    if (f.stateT > (sd.dur ?? 0.75)) { f.state = 'idle'; f.hasHit = false; }
  }

  if (f.hitstun > 0) f.state = 'hurt';
  if (f.state === 'hurt' && f.hitstun <= 0 && f.state !== 'ko') f.state = 'idle';

  // physics
  if (!onGround || f.vy < 0) { f.vy += GRAVITY * dt; f.state = f.state === 'ko' ? 'ko' : (f.hitstun > 0 ? 'hurt' : 'jump'); }
  f.y += f.vy * dt;
  if (f.y > FLOOR_Y) { f.y = FLOOR_Y; f.vy = 0; }
  f.x += f.vx * dt;
  if (!live || onGround) f.vx *= onGround ? 0.80 : 0.98;

  f.x = Math.max(60, Math.min(W - 60, f.x));

  // fighters push each other apart instead of overlapping
  const dx = foe.x - f.x;
  if (Math.abs(dx) < 62 && Math.abs(foe.y - f.y) < 40) {
    const push = (62 - Math.abs(dx)) / 2 * Math.sign(dx || 1);
    f.x -= push; foe.x += push;
    f.x = Math.max(60, Math.min(W - 60, f.x));
    foe.x = Math.max(60, Math.min(W - 60, foe.x));
  }

  // animation
  let st = f.state;
  if (st === 'block') st = 'idle';
  if (st === 'ko') st = 'hurt';
  if (st === 'special') st = (f.specialDef && f.specialDef.anim) || 'attack';
  f.anim.set(st);
  if (f.state === 'special' && f.specialDef && f.specialDef.anim) {
    const row = f.anim.spec, dur = f.specialDef.dur ?? .75;
    f.anim.frame = Math.min(row.frames - 1, Math.floor((f.stateT / dur) * row.frames));
  } else if (st === 'attack' && f.state === 'attack') {
    const a = ATTACKS[f.attackKind];
    const total = a.startup + a.active + a.recover;
    f.anim.frame = Math.min(3, Math.floor((f.stateT / total) * 4));
  } else if (st === 'jump') {
    f.anim.frame = f.vy < -220 ? 1 : f.vy < 180 ? 2 : 3;
  } else {
    f.anim.update(dt);
  }
}

function cpuThink(f, dt) {
  const foe = other(f);
  const d = Math.abs(foe.x - f.x);
  const o = { inLeft: false, inRight: false, wantJump: false, wantBlock: false, wantLight: false, wantHeavy: false, wantS1: false, wantS2: false };
  f.ai = f.ai || { t: 0, act: 0 };
  f.ai.t -= dt;
  const toFoe = foe.x > f.x ? 'inRight' : 'inLeft';
  const away = foe.x > f.x ? 'inLeft' : 'inRight';

  // Reach is measured centre-to-centre: 16 + reach + HITBOX_W/2.
  // Closing must beat that or the AI parks just outside range and whiffs forever.
  const LIGHT_RANGE = 16 + ATTACKS.light.reach + HITBOX_W / 2;   // 145
  if (foe.state === 'attack' && d < 150 && Math.random() < 0.06) o.wantBlock = true;
  else if (d > LIGHT_RANGE - 25) o[toFoe] = true;
  else if (d < 62) o[away] = true;
  else if (f.ai.t <= 0) {
    f.ai.t = 0.35 + Math.random() * 0.5;
    const r = Math.random();
    if (f.meter >= 50 && r < 0.28) { o.wantS1 = true; }
    else if (r < 0.55) o.wantLight = true;
    else if (r < 0.78) o.wantHeavy = true;
    else if (r < 0.88) o.wantJump = true;
    else o.wantBlock = true;
  }
  return o;
}

function updateBattle(dt) {
  if (roundState === 'intro') {
    roundT += dt;
    if (roundT > 1.5) { roundState = 'fight'; announce('FIGHT!', '#ffd257'); Sound.sfx('fight'); }
    for (const f of fighters) f.anim.update(dt);
    return;
  }
  if (roundState === 'fight') {
    timer -= dt;
    if (timer <= 0) {
      timer = 0;
      const [a, b] = fighters;
      roundState = 'ko'; roundT = 0;
      if (a.hp === b.hp) announce('DRAW', '#cfd8dc');
      else { (a.hp > b.hp ? a : b).wins++; announce('TIME UP', '#ffd257'); }
    }
  }
  for (const f of fighters) updateFighter(f, dt);
  updateProjectiles(dt);

  if (roundState === 'ko') {
    roundT += dt;
    if (roundT > 2.6) {
      const champ = fighters.find(f => f.wins >= ROUNDS_TO_WIN);
      if (champ) matchWinner = champ;
      else if (roundNo >= MAX_ROUNDS) {
        // a run of draws must never loop forever — settle on wins, then health
        const [a, b] = fighters;
        matchWinner = a.wins !== b.wins ? (a.wins > b.wins ? a : b)
                                        : (a.hp >= b.hp ? a : b);
      }
      if (matchWinner) { screen = 'result'; Sound.sfx('win'); }
      else { roundNo++; resetRound(); }
    }
  }
}

// ---------------------------------------------------------------- draw: stage

function drawStage() {
  const img = art.arena;
  const scale = H / img.height;
  const dw = img.width * scale;
  const mid = (fighters.length ? (fighters[0].x + fighters[1].x) / 2 : W / 2) - W / 2;
  const off = Math.max(0, Math.min(dw - W, (dw - W) / 2 + mid * 0.22));
  ctx.save();
  // Keep the illustrated stage rich, but push it one visual plane behind the
  // fighters so their silhouettes remain readable during close combat.
  ctx.filter = 'brightness(0.76) saturate(0.72) contrast(0.94)';
  ctx.drawImage(img, off / scale, 0, W / scale, img.height, 0, 0, W, H);
  ctx.restore();
  const grade = ctx.createLinearGradient(0, 120, 0, H);
  grade.addColorStop(0, 'rgba(3,9,18,.04)');
  grade.addColorStop(1, 'rgba(3,9,18,.20)');
  ctx.fillStyle = grade; ctx.fillRect(0, 0, W, H);
}

// fog and hit sparks read better over the fighters; the dozer and roots
// belong behind them so the caster is never hidden by their own move.
function drawFgProjectiles() {
  for (const p of projectiles) {
    if (p.kind === 'fog') {
      const k = Math.min(1, p.t / 0.4) * Math.min(1, p.life / 0.6);
      const h = 250, w = h * (art.fog.width / art.fog.height);
      ctx.save(); ctx.globalAlpha = 0.86 * k;
      ctx.drawImage(art.fog, p.x - w / 2, FLOOR_Y - h + 28 + Math.sin(p.t * 2) * 6, w, h); ctx.restore();
    } else if (p.kind === 'sticker') {
      drawStickerPopup(p);
    } else if (p.kind === 'shout' && p.t >= p.delay) {
      const e = p.t - p.delay;
      // p.life counts DOWN, so fade on it directly — not on (life - t)
      const k = Math.min(1, e / .1) * Math.min(1, p.life / .18);
      const pop = 1 + Math.max(0, .18 - e) * 1.8;
      shoutBubble(p.owner.x + p.owner.facing * 92, p.owner.y - 152, p.text,
                  -p.owner.facing, Math.max(0, k) * pop, 22);
    } else if (p.kind === 'mini' && p.t >= p.delay) {
      const foe = other(p.owner);
      const k = Math.min(1, (p.t - p.delay) / .16);          // pop in
      const out = Math.min(1, Math.max(0, p.life) / .35);     // pop out
      const hop = Math.abs(Math.sin((p.t + p.ox) * 9)) * 7;
      const h = FIGHTER_H * .58 * p.scale * (0.6 + 0.4 * k);
      ctx.save();
      ctx.globalAlpha = Math.min(k, out);
      drawCell(art.mini, p.anim.rect(), foe.x + p.ox, FLOOR_Y + p.oy - hop, h, p.face < 0);
      ctx.restore();
    } else if (p.kind === 'hoe') {
      const img = art.hoe;
      const hw = 116, hh = hw * (img.height / img.width);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin || 0);
      ctx.drawImage(img, -hw / 2, -hh / 2, hw, hh);
      ctx.restore();
    } else if (p.kind === 'rahul-mob' && p.t >= p.delay) {
      const mob = art.rahulMob, dust = art.dustWave;
      // the tallest clone fills most of the source height, so match it to the
      // fighters rather than the cell — anything larger buries the whole stage
      const mh = FIGHTER_H * 1.12, mw = mh * (mob.width / mob.height);
      const dh = mh * 0.52, dw = dh * (dust.width / dust.height);
      const tail = p.x - p.dir * (mw * .42);
      ctx.save();
      if (p.dir < 0) { ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.translate(-p.x, 0); }
      const fx = p.dir < 0 ? 2 * p.x - tail : tail;      // mirror the dust anchor too
      ctx.globalAlpha = .82;
      ctx.drawImage(dust, fx - dw / 2, FLOOR_Y - dh + 16, dw, dh);
      ctx.globalAlpha = 1;
      ctx.drawImage(mob, p.x - mw / 2, FLOOR_Y - mh + 8, mw, mh);
      ctx.restore();
    } else if (p.kind === 'burst') {
      const k = p.t / p.life;
      const s = (.45 + k * .95) * p.scale;
      const img = art.impactBurst;
      const bw = 300 * s, bh = bw * (img.height / img.width);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.translate(p.x, p.y); ctx.rotate(p.spin * k);
      ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    } else if (p.kind === 'ohiya') {
      ctx.save();
      if (p.t < .4) {
        const k = Math.min(1, p.t / .1);
        const pop = 1 + Math.max(0, .2 - p.t) * 1.7;
        shoutBubble(p.owner.x + p.owner.facing * 86, p.owner.y - 152, 'OH IYA BANG!',
                    -p.owner.facing, k * pop, 22);
      } else {
        const a = Math.max(0, 1 - (p.t - .4) / .7);
        ctx.globalAlpha = a; ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 5;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.owner.x, p.owner.y - 92, 34 + i * 20 + p.t * 28, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.restore();
    }
  }
  for (const s of sparks) {
    ctx.globalAlpha = 1 - s.t / s.life;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles() {
  for (const p of projectiles) {
    if (p.kind === 'dozer') {
      const h = 155, w = h * (art.dozer.width / art.dozer.height);
      ctx.save();
      if (p.dir < 0) { ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.translate(-p.x, 0); }
      ctx.drawImage(art.dozer, p.x - w / 2, FLOOR_Y - h + 10, w, h);
      ctx.restore();
      // dust at the blade
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#c8a878';
      for (let i = 0; i < 4; i++) {
        const r = 12 + Math.sin(p.t * 18 + i) * 6;
        ctx.beginPath();
        ctx.arc(p.x - p.dir * (w / 2 + i * 16), FLOOR_Y - 12 - i * 5, r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (p.kind === 'roots') {
      ctx.save();
      ctx.fillStyle = '#6b4a24'; ctx.strokeStyle = '#2c1d0c'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const rx = p.x - p.dir * i * 26;
        const hgt = 56 - i * 8 + Math.sin(p.t * 22 + i) * 6;
        ctx.beginPath();
        ctx.moveTo(rx - 13, FLOOR_Y);
        ctx.lineTo(rx, FLOOR_Y - hgt);
        ctx.lineTo(rx + 13, FLOOR_Y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    } else if (p.kind === 'rahul-clone' && p.t >= p.delay) {
      const row = p.owner.def.art.layout.rows.attack;
      const idx = Math.min(row.length - 1, Math.floor((p.t - p.delay) * 10));
      ctx.save(); ctx.globalAlpha = .62 + p.clone * .12;
      drawCell(p.owner.def.art, row[idx], p.x, FLOOR_Y, FIGHTER_H / STAND_RATIO, p.dir < 0, 1);
      ctx.restore();
    }
  }
}

function drawFighters() {
  const order = [...fighters].sort((a, b) => (a.state === 'ko') - (b.state === 'ko'));
  for (const f of order) {
    const alpha = f.state === 'ko' ? 0.92 : 1;
    const tint = f.flash > 0 ? 'rgba(255,90,90,0.55)' : null;

    // A localized arena light separates each moving silhouette from the busy
    // garden and plaza without looking like a flat UI highlight.
    const hiddenByTeleport = projectiles.some(p => p.kind === 'ohiya' && p.owner === f && p.t > .31 && p.t < .43);
    if (hiddenByTeleport) continue;
    ctx.save();
    const halo = ctx.createRadialGradient(f.x, f.y - 96, 16, f.x, f.y - 96, 118);
    halo.addColorStop(0, f.side === 0 ? 'rgba(255,221,139,.25)' : 'rgba(145,220,255,.24)');
    halo.addColorStop(.58, f.side === 0 ? 'rgba(255,184,80,.10)' : 'rgba(65,166,255,.10)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(f.x - 125, f.y - 225, 250, 245);
    ctx.globalAlpha = .34;
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = '#02070c';
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 2, 55, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = f.side === 0 ? 'rgba(255,211,106,.88)' : 'rgba(99,196,255,.88)';
    ctx.shadowBlur = 15;
    if (f.state === 'ko') {
      ctx.translate(f.x, f.y);
      ctx.rotate(f.facing * -0.5);
      ctx.translate(-f.x, -f.y);
    }
    drawCell(f.def.art, f.anim.rect(), f.x, f.y,
      FIGHTER_H / STAND_RATIO * (f.def.battleScale || 1), f.facing < 0, alpha, tint);
    ctx.restore();
    if (f.state === 'block') {
      ctx.save();
      ctx.globalAlpha = 0.45; ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(f.x + f.facing * 22, f.y - FIGHTER_H * 0.5, 52, -1.1, 1.1);
      ctx.stroke(); ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- draw: HUD

function bevel(x, y, w, h, fill, line = '#0a1620', lw = 3) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h);
}

function drawHealthBar(f, side) {
  const bw = 330, bh = 26, pad = 18;
  const px = side === 0 ? pad + 62 : W - pad - 62 - bw;
  const py = 30;
  bevel(px - 3, py - 3, bw + 6, bh + 6, '#0d1a24', '#e8d9a8', 3);
  ctx.fillStyle = '#3a1616'; ctx.fillRect(px, py, bw, bh);
  const frac = Math.max(0, f.hp / MAX_HP);
  const g = ctx.createLinearGradient(px, 0, px + bw, 0);
  g.addColorStop(0, '#ffdf6e'); g.addColorStop(0.55, '#ff9b30'); g.addColorStop(1, '#e33a2a');
  ctx.fillStyle = g;
  if (side === 0) ctx.fillRect(px, py, bw * frac, bh);
  else ctx.fillRect(px + bw * (1 - frac), py, bw * frac, bh);

  // meter
  const my = py + bh + 7, mh = 9;
  ctx.fillStyle = '#10202c'; ctx.fillRect(px, my, bw, mh);
  const mf = f.meter / MAX_METER;
  ctx.fillStyle = f.meter >= 50 ? '#57e0ff' : '#2b7fa0';
  if (side === 0) ctx.fillRect(px, my, bw * mf, mh);
  else ctx.fillRect(px + bw * (1 - mf), my, bw * mf, mh);
  ctx.strokeStyle = '#0a1620'; ctx.lineWidth = 2; ctx.strokeRect(px, my, bw, mh);

  // portrait
  const ps = 62, pxp = side === 0 ? pad : W - pad - ps;
  bevel(pxp, py - 3, ps, ps, '#16242e', '#e8d9a8', 3);
  ctx.drawImage(f.def.portraitImg, pxp + 2, py - 1, ps - 4, ps - 4);

  // round pips sit under the portrait, clear of the name text
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const cx = pxp + 15 + i * 22;
    ctx.beginPath(); ctx.arc(cx, py + ps + 10, 6, 0, 7);
    ctx.fillStyle = i < f.wins ? '#ffd257' : 'rgba(255,255,255,.22)';
    ctx.fill(); ctx.strokeStyle = '#0a1620'; ctx.lineWidth = 2; ctx.stroke();
  }

  // label + name
  const nameY = py + bh + 32;
  ctx.font = '900 17px Impact, "Arial Narrow", sans-serif';
  const nameW = Math.min(190, ctx.measureText(f.def.name).width + 24);
  const nameX = side === 0 ? px - 7 : px + bw - nameW + 7;
  slantPanel(nameX, nameY - 20, nameW, 25, side === 0 ? 7 : -7,
    'rgba(3,9,16,.78)', side === 0 ? 'rgba(255,106,74,.72)' : 'rgba(87,168,255,.72)');
  ctx.textAlign = side === 0 ? 'left' : 'right';
  const nameTextX = side === 0 ? px + 5 : px + bw - 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#05090e'; ctx.lineWidth = 5;
  ctx.strokeText(f.def.name, nameTextX, nameY);
  ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#fff0af';
  ctx.fillText(f.def.name, nameTextX, nameY);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#9fd8ff';
  ctx.fillText(side === 0 ? '1P' : '2P', side === 0 ? px : px + bw, py - 10);
  ctx.textAlign = 'left';
}


// ---------------------------------------------------------------- skill showcase

const stickerBuf = document.createElement('canvas');
const sbx = stickerBuf.getContext('2d');

/** Sticker die-cut: the silhouette stamped in white around the art, then the art. */
function drawSticker(run, rect, cx, cy, h, ring) {
  const dw = h * (rect.w / rect.h), dh = h;
  if (stickerBuf.width !== rect.w || stickerBuf.height !== rect.h) {
    stickerBuf.width = rect.w; stickerBuf.height = rect.h;
  }
  sbx.clearRect(0, 0, rect.w, rect.h);
  sbx.globalCompositeOperation = 'source-over';
  sbx.drawImage(run.atlas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  sbx.globalCompositeOperation = 'source-atop';
  sbx.fillStyle = '#ffffff';
  sbx.fillRect(0, 0, rect.w, rect.h);
  sbx.globalCompositeOperation = 'source-over';

  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    ctx.drawImage(stickerBuf, cx - dw / 2 + Math.cos(th) * ring,
                              cy - dh / 2 + Math.sin(th) * ring, dw, dh);
  }
  ctx.drawImage(run.atlas, rect.x, rect.y, rect.w, rect.h, cx - dw / 2, cy - dh / 2, dw, dh);
}

/** Skill sticker that pops above the caster while the fight keeps running. */
function drawStickerPopup(p) {
  const k = p.t / STICKER_DUR;
  let scale, fade = 1;
  if (k < .14) { const e = k / .14; scale = 1.18 - .18 * (1 - (1 - e) * (1 - e)); scale *= e < .5 ? e * 2 : 1; }
  else if (k < .78) { scale = 1 + Math.sin((k - .14) * 7) * .022; }
  else { const e = (k - .78) / .22; scale = 1 + e * .25; fade = 1 - e; }
  if (scale <= 0) return;

  const f = p.owner;
  const h = 150 * scale;
  const cx = Math.max(110, Math.min(W - 110, f.x));
  const cy = f.y - FIGHTER_H - 74 - Math.sin(p.t * 3) * 4;

  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);

  // colour pop + rays read instantly at this size
  const blob = ctx.createRadialGradient(cx, cy, 8, cx, cy, h * .92);
  blob.addColorStop(0, p.sp.cutinHue); blob.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = fade * .8; ctx.fillStyle = blob;
  ctx.beginPath(); ctx.arc(cx, cy, h * .92, 0, 7); ctx.fill();
  ctx.globalAlpha = Math.max(0, fade);

  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(p.t * .9);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI * 2 / 12);
    ctx.globalAlpha = fade * .13; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -h * .42); ctx.lineTo(8, -h * 1.02); ctx.lineTo(-8, -h * 1.02);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = Math.max(0, fade);

  drawSticker(p.run, p.anim.rect(), cx, cy, h, 4.5);

  const text = p.sp.cutinText || p.sp.name;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `italic 900 ${Math.round(27 * scale)}px Impact, "Arial Black", sans-serif`;
  ctx.save();
  ctx.translate(cx, cy + h * .62); ctx.rotate(-.035); ctx.lineJoin = 'round';
  ctx.lineWidth = 11; ctx.strokeStyle = '#ffffff'; ctx.strokeText(text, 0, 0);
  ctx.lineWidth = 6;  ctx.strokeStyle = '#141414'; ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -16, 0, 16);
  g.addColorStop(0, '#fff6c0'); g.addColorStop(.55, '#ffd84d'); g.addColorStop(1, '#f2a516');
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  ctx.restore();

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawBattleHUD() {
  drawHealthBar(fighters[0], 0);
  drawHealthBar(fighters[1], 1);

  // timer
  bevel(W / 2 - 44, 24, 88, 52, '#0d1a24', '#e8d9a8', 3);
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.fillStyle = timer <= 10 ? '#ff6b4a' : '#ffe9a8';
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(timer), W / 2, 62);

  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#cfe6f5';
  ctx.fillText('ROUND ' + roundNo, W / 2, 92);

  if (roundState === 'intro') {
    const k = Math.min(1, roundT / 0.4);
    ctx.font = `bold ${Math.round(56 * k)}px "Trebuchet MS", sans-serif`;
    ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#7a3b12'; ctx.lineWidth = 6;
    ctx.strokeText('ROUND ' + roundNo, W / 2, H / 2);
    ctx.fillText('ROUND ' + roundNo, W / 2, H / 2);
  }
  if (banner) {
    const k = Math.min(1, banner.t / 0.18);
    const a = banner.t > 1.1 ? 1 - (banner.t - 1.1) / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `bold ${Math.round(50 * k)}px "Trebuchet MS", sans-serif`;
    ctx.strokeStyle = '#22160a'; ctx.lineWidth = 7;
    ctx.strokeText(banner.text, W / 2, H / 2 - 60);
    ctx.fillStyle = banner.color;
    ctx.fillText(banner.text, W / 2, H / 2 - 60);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- screens

let sel = { p1: 0, p2: 1, locked: [false, false], cursor: [0, 1] };

function selectKey(code) {
  const move = (p, d) => {
    if (sel.locked[p]) return;
    Sound.sfx('uiMove');
    sel.cursor[p] = (sel.cursor[p] + d + ROSTER.length) % ROSTER.length;
  };
  const activeP = mode === 'cpu' && sel.locked[0] ? 1 : 0;
  if (code === CONTROLS[0].left) move(activeP, -1);
  if (code === CONTROLS[0].right) move(activeP, 1);
  if (code === CONTROLS[0].light || code === 'Enter') lockIn(activeP);
  if (mode === '2p') {
    if (code === CONTROLS[1].left) move(1, -1);
    if (code === CONTROLS[1].right) move(1, 1);
    if (code === CONTROLS[1].light) lockIn(1);
  }
}
function lockIn(p) {
  if (sel.locked[p]) return;
  Sound.sfx('lockIn');
  sel.locked[p] = true;
  if (sel.locked[0] && sel.locked[1]) {
    sel.p1 = sel.cursor[0]; sel.p2 = sel.cursor[1];
    screen = 'vs'; vsT = 0;
  }
}

let vsT = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------- presentation helpers

let embers = [];
function seedEmbers() {
  embers = Array.from({ length: 46 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vy: -12 - Math.random() * 26, vx: (Math.random() - .5) * 14,
    r: 1 + Math.random() * 2.4, a: .25 + Math.random() * .6,
    tw: Math.random() * 6,
  }));
}
function updateEmbers(dt) {
  for (const e of embers) {
    e.y += e.vy * dt; e.x += e.vx * dt; e.tw += dt * 3;
    if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
  }
}
function drawEmbers(scale = 1) {
  for (const e of embers) {
    const a = e.a * (0.55 + 0.45 * Math.sin(e.tw)) * scale;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Slow drifting Ken Burns crop so static key art never feels frozen. */
function drawCover(img, t, amount = 0.06, panX = 0) {
  const zoom = 1 + amount * (0.5 + 0.5 * Math.sin(t * 0.22));
  const sw = img.width / zoom, sh = img.height / zoom;
  const cx = img.width / 2 + Math.sin(t * 0.15) * img.width * 0.015 + panX;
  const cy = img.height / 2 + Math.cos(t * 0.12) * img.height * 0.012;
  const ar = W / H;
  let cw = sw, chh = sw / ar;
  if (chh > sh) { chh = sh; cw = sh * ar; }
  ctx.drawImage(img, cx - cw / 2, cy - chh / 2, cw, chh, 0, 0, W, H);
}

/** Layered arcade logo: extrude, outline, gradient fill, moving shine. */
function drawLogo(cx, cy, size, t) {
  const text = 'KONOHA ARENA';
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
  ctx.lineJoin = 'round';
  for (let d = 8; d >= 1; d--) {                 // extrude
    ctx.fillStyle = d > 4 ? '#3a1405' : '#5c2308';
    ctx.fillText(text, cx, cy + d);
  }
  ctx.lineWidth = size * 0.19; ctx.strokeStyle = '#2a1206'; ctx.strokeText(text, cx, cy);
  ctx.lineWidth = size * 0.10; ctx.strokeStyle = '#f7c65a'; ctx.strokeText(text, cx, cy);
  const g = ctx.createLinearGradient(0, cy - size * 0.8, 0, cy + size * 0.18);
  g.addColorStop(0, '#fff3b0'); g.addColorStop(0.42, '#ffcc3d');
  g.addColorStop(0.68, '#f4631f'); g.addColorStop(1, '#b8260f');
  ctx.fillStyle = g; ctx.fillText(text, cx, cy);

  const m = ctx.measureText(text);
  const shine = ((t * 0.38) % 1.6) - 0.3;
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - m.width / 2 - 10, cy - size, m.width + 20, size * 1.35); ctx.clip();
  const sg = ctx.createLinearGradient(cx - m.width / 2 + shine * m.width - 60, 0,
                                      cx - m.width / 2 + shine * m.width + 60, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,.55)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = sg; ctx.fillText(text, cx, cy);
  ctx.restore();
  ctx.restore();
}

function slantPanel(x, y, w, h, skew, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y); ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - skew, y + h); ctx.lineTo(x, y + h);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

// ------------------------------------------------- live hero previews

const preview = [
  { idx: -1, anim: null, enter: 0, stat: 0, lockT: 0 },
  { idx: -1, anim: null, enter: 0, stat: 0, lockT: 0 },
];

/** Drives each side's preview from the real sprite atlas so it is never a still. */
function syncPreview(p, dt) {
  const pv = preview[p], idx = sel.cursor[p];
  if (pv.idx !== idx) {
    pv.idx = idx;
    pv.anim = new Anim(ROSTER[idx].art, 'idle');
    pv.enter = 0; pv.stat = 0;
  }
  pv.enter = Math.min(1, pv.enter + dt * 3.4);
  pv.stat = Math.min(1, pv.stat + dt * 2.0);
  pv.lockT = sel.locked[p] ? pv.lockT + dt : 0;
  // celebrate a lock-in by playing the character's own attack once
  pv.anim.set(sel.locked[p] && pv.lockT < 0.62 ? 'attack' : 'idle');
  pv.anim.update(dt);
}

function drawTitle() {
  const t = titleT;
  drawCover(art.keyArt, t, 0.07);

  // cinematic grading: darken top for the logo, bottom for the menu
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(6,10,16,.86)'); g.addColorStop(0.34, 'rgba(6,10,16,.18)');
  g.addColorStop(0.62, 'rgba(6,10,16,.30)'); g.addColorStop(1, 'rgba(4,7,12,.92)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawEmbers();

  drawLogo(W / 2, 118, 62, t);

  // subtitle rule
  ctx.textAlign = 'center';
  ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
  const sub = '1  O N  1   B A T T L E';
  const sw = ctx.measureText(sub).width;
  ctx.strokeStyle = 'rgba(247,198,90,.75)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - sw / 2 - 34, 144); ctx.lineTo(W / 2 - sw / 2 - 12, 144);
  ctx.moveTo(W / 2 + sw / 2 + 12, 144); ctx.lineTo(W / 2 + sw / 2 + 34, 144);
  ctx.stroke();
  ctx.fillStyle = '#f7e3a8'; ctx.fillText(sub, W / 2, 150);

  // menu
  const items = ['1P  vs  CPU', '2P  VERSUS'];
  items.forEach((label, i) => {
    const on = menuIdx === i;
    const y = 372 + i * 66;
    const pulse = on ? 1 + Math.sin(t * 5) * 0.015 : 1;
    ctx.save();
    ctx.translate(W / 2, y); ctx.scale(pulse, pulse); ctx.translate(-W / 2, -y);
    slantPanel(W / 2 - 176, y - 26, 352, 50, 16,
      on ? 'rgba(244,140,32,.94)' : 'rgba(10,18,28,.78)',
      on ? '#ffe9a8' : 'rgba(232,217,168,.42)');
    ctx.font = 'bold 23px "Trebuchet MS", sans-serif';
    ctx.fillStyle = on ? '#241503' : '#c7d6e2';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, y + 8);
    if (on) {
      const a = 0.55 + 0.45 * Math.sin(t * 7);
      ctx.globalAlpha = a; ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 205, y - 10); ctx.lineTo(W / 2 - 188, y - 1);
      ctx.lineTo(W / 2 - 205, y + 8); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W / 2 + 205, y - 10); ctx.lineTo(W / 2 + 188, y - 1);
      ctx.lineTo(W / 2 + 205, y + 8); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });

  ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3.4);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('PRESS  ENTER', W / 2, 508);
  ctx.globalAlpha = 1;
  ctx.font = '11px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(199,214,226,.5)';
  ctx.textAlign = 'left';
  ctx.fillText(Sound.isReady() ? (Sound.isMuted() ? 'M  SOUND OFF' : 'M  SOUND ON')
                               : 'PRESS ANY KEY FOR SOUND', 22, 522);
  ctx.textAlign = 'right'; ctx.fillText('INDONESIAN LEGENDS', W - 22, 522);
  ctx.textAlign = 'left';
}

function drawSelect() {
  const t = titleT;
  drawCover(art.selectBg, t, 0.025);

  // Film-grade vignette keeps the background dimensional while the roster reads instantly.
  let grade = ctx.createLinearGradient(0, 0, 0, H);
  grade.addColorStop(0, 'rgba(2,5,10,.34)');
  grade.addColorStop(.54, 'rgba(3,7,12,.10)');
  grade.addColorStop(1, 'rgba(2,4,8,.78)');
  ctx.fillStyle = grade; ctx.fillRect(0, 0, W, H);

  // The red and blue broadcast split echoes the reference without flattening the arena art.
  const red = ctx.createLinearGradient(0, 0, 350, 0);
  red.addColorStop(0, 'rgba(183,17,22,.72)'); red.addColorStop(1, 'rgba(90,8,15,0)');
  ctx.fillStyle = red; ctx.fillRect(0, 0, 355, H);
  const blue = ctx.createLinearGradient(W, 0, W - 350, 0);
  blue.addColorStop(0, 'rgba(0,74,190,.72)'); blue.addColorStop(1, 'rgba(0,35,100,0)');
  ctx.fillStyle = blue; ctx.fillRect(W - 355, 0, 355, H);

  drawEmbers(.55);

  // Top broadcast rail.
  ctx.fillStyle = 'rgba(3,8,15,.82)'; ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = '#ef3340'; ctx.fillRect(0, 61, W / 2 - 92, 3);
  ctx.fillStyle = '#168cff'; ctx.fillRect(W / 2 + 92, 61, W / 2 - 92, 3);
  ctx.textAlign = 'center';
  ctx.font = '900 13px Impact, "Arial Narrow", sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillStyle = '#f3f6fa';
  ctx.fillText('PLAYER 1', 128, 29);
  ctx.fillText(mode === 'cpu' ? 'CPU RIVAL' : 'PLAYER 2', W - 128, 29);
  drawLogo(W / 2, 42, 25, t);

  // Live hero bays use the actual gameplay animations.
  [0, 1].forEach(p => {
    const pv = preview[p], def = ROSTER[pv.idx], leftSide = p === 0;
    const cx = leftSide ? 132 : W - 132;
    const ease = 1 - Math.pow(1 - pv.enter, 3);
    const slide = (leftSide ? -82 : 82) * (1 - ease);
    const bob = Math.sin(t * 1.55 + p * 1.4) * 3;

    const halo = ctx.createRadialGradient(cx, 285, 10, cx, 285, 190);
    halo.addColorStop(0, leftSide ? 'rgba(255,58,50,.28)' : 'rgba(35,145,255,.28)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, 285, 190, 0, 7); ctx.fill();

    // Purpose-built HD bust art replaces the small gameplay sprite here. A
    // restrained breathing scale and shoulder drift keep the portrait alive.
    const img = def.selectPreviewImg;
    const breathe = 1 + Math.sin(t * 1.45 + p * 1.7) * .012;
    const lockKick = sel.locked[p] ? 1 + Math.max(0, .045 - pv.lockT * .12) : 1;
    const dh = 405 * breathe * lockKick;
    const dw = dh * (img.width / img.height);
    const portraitX = cx + slide + Math.sin(t * .72 + p) * 2;
    const portraitY = 420 + bob;
    ctx.save();
    ctx.beginPath();
    ctx.rect(leftSide ? 0 : W - 306, 62, 306, 371);
    ctx.clip();
    ctx.globalAlpha = .2 + .8 * ease;
    ctx.shadowColor = leftSide ? 'rgba(255,47,54,.95)' : 'rgba(22,140,255,.95)';
    ctx.shadowBlur = 26 + Math.sin(t * 2.1) * 4;
    ctx.drawImage(img, portraitX - dw / 2, portraitY - dh, dw, dh);
    if (sel.locked[p] && pv.lockT < .18) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 1 - pv.lockT / .18;
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.fillRect(portraitX - dw / 2, portraitY - dh, dw, dh);
    }
    ctx.restore();

    // Angled metal nameplate and fighter record.
    const plateX = leftSide ? 14 : W - 272;
    slantPanel(plateX, 402, 258, 58, leftSide ? 15 : -15,
      'rgba(4,9,16,.91)', leftSide ? '#f04448' : '#299aff');
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 28px Impact, "Arial Narrow", sans-serif';
    ctx.strokeStyle = '#05080d'; ctx.lineWidth = 7; ctx.strokeText(def.name, cx, 434);
    ctx.fillStyle = '#f7f9fb'; ctx.fillText(def.name, cx, 434);
    ctx.font = '700 9px "Trebuchet MS", sans-serif';
    ctx.fillStyle = leftSide ? '#ff8e8e' : '#85c7ff';
    ctx.fillText(def.blurb.toUpperCase(), cx, 451);

    Object.keys(def.stats).forEach((key, i) => {
      const y = 474 + i * 14, startX = leftSide ? 18 : W - 267;
      ctx.textAlign = 'left'; ctx.font = '700 8px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#d7e0e9'; ctx.fillText(key, startX, y + 7);
      for (let s = 0; s < 5; s++) {
        ctx.fillStyle = s < Math.round(def.stats[key] * pv.stat)
          ? (leftSide ? '#ff3d46' : '#1e92ff') : 'rgba(215,224,233,.14)';
        ctx.fillRect(startX + 62 + s * 34, y, 28, 7);
      }
    });

    if (sel.locked[p]) {
      const k = Math.min(1, pv.lockT * 6);
      ctx.save(); ctx.globalAlpha = k; ctx.translate(cx, 86); ctx.scale(1.5 - .5 * k, 1.5 - .5 * k);
      ctx.textAlign = 'center'; ctx.font = 'italic 900 22px Impact, sans-serif';
      ctx.strokeStyle = '#05080d'; ctx.lineWidth = 7; ctx.strokeText('LOCKED IN', 0, 0);
      ctx.fillStyle = '#ffd45a'; ctx.fillText('LOCKED IN', 0, 0); ctx.restore();
    }
  });

  // Six-slot roster console: two fighters available, four future challengers sealed.
  const slots = 6, cols = 3, cardW = 102, cardH = 112, gapX = 10, gapY = 10;
  const gridW = cols * cardW + (cols - 1) * gapX;
  const gx = W / 2 - gridW / 2, gy = 137;
  ctx.fillStyle = 'rgba(2,7,13,.88)'; ctx.fillRect(gx - 18, gy - 38, gridW + 36, 275);
  ctx.strokeStyle = 'rgba(192,211,228,.34)'; ctx.lineWidth = 1; ctx.strokeRect(gx - 18, gy - 38, gridW + 36, 275);
  ctx.textAlign = 'center';
  ctx.font = '900 13px Impact, "Arial Narrow", sans-serif'; ctx.fillStyle = '#dfe8f0';
  ctx.fillText('SELECT YOUR FIGHTER', W / 2, gy - 15);

  for (let i = 0; i < slots; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = gx + col * (cardW + gapX), y = gy + row * (cardH + gapY);
    const def = ROSTER[i], locked = !def;
    const p1On = !locked && sel.cursor[0] === i;
    const cpuChoosing = mode === 'cpu' && sel.locked[0] && !sel.locked[1];
    const p2On = !locked && sel.cursor[1] === i && (mode === '2p' || cpuChoosing);
    const active = p1On || p2On;
    const lift = active ? 4 + Math.sin(t * 5) * 1.5 : 0;
    ctx.save(); ctx.translate(0, -lift);
    ctx.fillStyle = locked ? 'rgba(8,15,24,.92)' : 'rgba(12,21,31,.96)';
    ctx.fillRect(x, y, cardW, cardH);
    if (def) {
      ctx.drawImage(def.portraitImg, x + 3, y + 3, cardW - 6, 84);
      const fade = ctx.createLinearGradient(0, y + 55, 0, y + 91);
      fade.addColorStop(0, 'rgba(4,9,15,0)'); fade.addColorStop(1, 'rgba(4,9,15,.96)');
      ctx.fillStyle = fade; ctx.fillRect(x + 3, y + 52, cardW - 6, 39);
      ctx.font = '900 11px Impact, "Arial Narrow", sans-serif'; ctx.fillStyle = '#f4f6f8';
      ctx.fillText(def.name, x + cardW / 2, y + 103);
      if (!active) { ctx.fillStyle = 'rgba(2,6,11,.32)'; ctx.fillRect(x, y, cardW, cardH); }
    } else {
      const lockGlow = .16 + .06 * Math.sin(t * 1.8 + i);
      ctx.fillStyle = `rgba(74,97,119,${lockGlow})`; ctx.fillRect(x + 4, y + 4, cardW - 8, cardH - 8);
      ctx.font = '900 58px Impact, sans-serif'; ctx.fillStyle = 'rgba(191,207,222,.42)';
      ctx.fillText('?', x + cardW / 2, y + 73);
      ctx.font = '700 8px "Trebuchet MS", sans-serif'; ctx.fillStyle = 'rgba(191,207,222,.35)';
      ctx.fillText('CLASSIFIED', x + cardW / 2, y + 101);
    }
    ctx.strokeStyle = locked ? 'rgba(135,158,179,.25)' : 'rgba(205,221,235,.42)';
    ctx.lineWidth = 2; ctx.strokeRect(x, y, cardW, cardH);
    if (p1On) { ctx.shadowColor = '#ff313d'; ctx.shadowBlur = 13; ctx.strokeStyle = '#ff3842'; ctx.lineWidth = 4; ctx.strokeRect(x - 3, y - 3, cardW + 6, cardH + 6); }
    if (p2On) { ctx.shadowColor = '#158dff'; ctx.shadowBlur = 13; ctx.strokeStyle = '#299aff'; ctx.lineWidth = 4; ctx.strokeRect(x - 7, y - 7, cardW + 14, cardH + 14); }
    ctx.restore();
  }

  // Bottom command strip.
  ctx.fillStyle = 'rgba(2,6,11,.9)'; ctx.fillRect(306, 397, 348, 63);
  ctx.strokeStyle = 'rgba(211,226,239,.24)'; ctx.strokeRect(306, 397, 348, 63);
  ctx.textAlign = 'center'; ctx.font = 'italic 900 18px Impact, sans-serif';
  const choosingCpu = mode === 'cpu' && sel.locked[0] && !sel.locked[1];
  ctx.fillStyle = '#f4cf58'; ctx.fillText(choosingCpu ? 'CHOOSE CPU RIVAL' : 'CHOOSE YOUR FIGHTER', W / 2, 421);
  ctx.font = '700 10px "Trebuchet MS", sans-serif'; ctx.fillStyle = '#aebdca';
  const selectHint = mode === 'cpu'
    ? (sel.locked[0] ? 'CHOOSE CPU RIVAL    •    A / D + F / ENTER' : 'CHOOSE YOUR FIGHTER    •    A / D + F / ENTER')
    : 'P1  A / D + F       P2  ← / → + J';
  ctx.fillText(selectHint, W / 2, 443);
  ctx.textAlign = 'left';
}

function drawVS() {
  const t = reduceMotion ? 2.2 : vsT;
  const clamp = v => Math.max(0, Math.min(1, v));
  const out = v => 1 - Math.pow(1 - clamp(v), 4);
  const panelK = out(t / .42);
  const heroK = out((t - .12) / .62);
  const copyK = out((t - .54) / .35);

  ctx.fillStyle = '#03070d'; ctx.fillRect(0, 0, W, H);

  // Red and blue broadcast panels slam together on one shared ease.
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W / 2, H); ctx.clip();
  ctx.translate(-(1 - panelK) * W / 2, 0);
  const lg = ctx.createLinearGradient(0, 0, W / 2, H);
  lg.addColorStop(0, '#5d0710'); lg.addColorStop(.55, '#d11d2b'); lg.addColorStop(1, '#27040c');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W / 2 + 18, H);
  ctx.globalAlpha = .24; drawCover(art.selectBg, t, 0, -210); ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(W / 2, 0, W / 2, H); ctx.clip();
  ctx.translate((1 - panelK) * W / 2, 0);
  const rg = ctx.createLinearGradient(W, 0, W / 2, H);
  rg.addColorStop(0, '#003d91'); rg.addColorStop(.55, '#087cdc'); rg.addColorStop(1, '#021d50');
  ctx.fillStyle = rg; ctx.fillRect(W / 2 - 18, 0, W / 2 + 18, H);
  ctx.globalAlpha = .22; drawCover(art.selectBg, t, 0, 210); ctx.restore();

  // Speed streaks make the entrance feel forceful without obscuring the art.
  ctx.save(); ctx.globalAlpha = .17 * panelK; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const y = 72 + i * 54 + Math.sin(i * 2.1) * 18;
    ctx.strokeStyle = i % 2 ? '#ff8a72' : '#8fd1ff';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 85); ctx.stroke();
  }
  ctx.restore();

  [0, 1].forEach(i => {
    const def = ROSTER[i === 0 ? sel.p1 : sel.p2];
    const img = def.selectPreviewImg;
    const targetX = i === 0 ? 245 : W - 245;
    const x = (i === 0 ? -245 : W + 245) + (targetX - (i === 0 ? -245 : W + 245)) * heroK;
    const breathe = 1 + Math.sin(t * 1.5 + i) * .009;
    const dh = 515 * breathe, dw = dh * (img.width / img.height);
    const desiredFacing = i === 0 ? 1 : -1;
    const flip = def.selectFacing !== desiredFacing;
    ctx.save();
    ctx.beginPath(); ctx.rect(i === 0 ? 0 : W / 2, 54, W / 2, H - 54); ctx.clip();
    ctx.globalAlpha = heroK;
    ctx.shadowColor = i === 0 ? '#ff3545' : '#32a5ff'; ctx.shadowBlur = 28;
    if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    ctx.drawImage(img, x - dw / 2, H - dh + 32, dw, dh);
    ctx.restore();

    // Name plates arrive after the portraits settle.
    ctx.save(); ctx.globalAlpha = copyK;
    const nx = i === 0 ? 24 : W - 376;
    slantPanel(nx + (i === 0 ? -48 * (1 - copyK) : 48 * (1 - copyK)), 430, 352, 72,
      i === 0 ? 18 : -18, 'rgba(2,6,12,.92)', i === 0 ? '#ff3b48' : '#2d9eff');
    ctx.textAlign = 'center'; ctx.font = 'italic 900 39px Impact, "Arial Narrow", sans-serif';
    ctx.strokeStyle = '#02050a'; ctx.lineWidth = 9; ctx.strokeText(def.name, i === 0 ? 194 : W - 194, 472);
    ctx.fillStyle = '#f7f8fa'; ctx.fillText(def.name, i === 0 ? 194 : W - 194, 472);
    ctx.font = '800 10px "Trebuchet MS", sans-serif';
    ctx.fillStyle = i === 0 ? '#ff9aa1' : '#93d2ff';
    ctx.fillText(i === 0 ? 'PLAYER 1' : (mode === 'cpu' ? 'CPU RIVAL' : 'PLAYER 2'), i === 0 ? 194 : W - 194, 492);
    ctx.restore();
  });

  // Hand-drawn lightning seam with a short impact flash.
  ctx.save();
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 18;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(486, 0);
  const bolts = [[466,72],[493,132],[470,192],[489,253],[462,318],[486,378],[469,445],[482,540]];
  bolts.forEach(([x,y]) => ctx.lineTo(x + Math.sin(t * 15 + y) * 3, y)); ctx.stroke();
  ctx.strokeStyle = '#70c8ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

  const impact = clamp((t - .72) / .32);
  const overshoot = impact < .72 ? out(impact / .72) * 1.12 : 1.12 - (impact - .72) / .28 * .12;
  ctx.save(); ctx.translate(W / 2, 270); ctx.scale(overshoot, overshoot); ctx.rotate(-.08);
  ctx.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 16;
    const r = i % 2 ? 48 : 91;
    const px = Math.cos(a) * r, py = Math.sin(a) * r * .72;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.shadowColor = '#ff2739'; ctx.shadowBlur = 24;
  ctx.fillStyle = '#d91427'; ctx.fill();
  ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 5; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center'; ctx.font = 'italic 900 134px Impact, sans-serif';
  ctx.strokeStyle = '#160307'; ctx.lineWidth = 18; ctx.strokeText('VS', 0, 35);
  ctx.strokeStyle = '#ffef8a'; ctx.lineWidth = 7; ctx.strokeText('VS', 0, 35);
  const vg = ctx.createLinearGradient(0, -75, 0, 45);
  vg.addColorStop(0, '#fff9b0'); vg.addColorStop(.38, '#ffc928'); vg.addColorStop(1, '#ef3428');
  ctx.fillStyle = vg; ctx.fillText('VS', 0, 35); ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '900 13px Impact, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.86)';
  ctx.fillText('KONOHA ARENA  •  FINAL MATCHUP', W / 2, 31);
  if (t > 1.7) {
    ctx.globalAlpha = .55 + .45 * Math.sin(t * 7);
    ctx.font = '900 15px Impact, sans-serif'; ctx.fillStyle = '#fff0a8';
    ctx.fillText('GET READY', W / 2, 526); ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}

function drawResult() {
  drawStage();
  ctx.fillStyle = 'rgba(6,14,22,.72)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 50px "Trebuchet MS", sans-serif';
  ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 8;
  ctx.strokeText(matchWinner.def.name + ' WINS', W / 2, 210);
  ctx.fillStyle = matchWinner.def.tint;
  ctx.fillText(matchWinner.def.name + ' WINS', W / 2, 210);
  const img = matchWinner.def.fullImg;
  const dh = 240, dw = dh * (img.width / img.height);
  ctx.drawImage(img, W / 2 - dw / 2, 236, dw, dh);
  ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('ENTER for a rematch', W / 2, 512);
  ctx.textAlign = 'left';
}

function advance() {
  Sound.unlock(); Sound.sfx('uiConfirm');
  if (screen === 'title') {
    screen = 'select';
    sel.locked = [false, false];
    sel.cursor = [0, 1];
    preview.forEach(pv => { pv.idx = -1; pv.lockT = 0; });
  }
  else if (screen === 'result') { screen = 'title'; roundNo = 1; matchWinner = null; }
}

function startBattle() {
  fighters = [makeFighter(ROSTER[sel.p1], 0), makeFighter(ROSTER[sel.p2], 1)];
  if (mode === 'cpu') fighters[1].cpu = true;
  roundNo = 1; matchWinner = null;
  resetRound();
  screen = 'battle';
}

// ---------------------------------------------------------------- loop

const SCREEN_MUSIC = { title: 'title', select: 'select', vs: 'select', battle: 'battle', result: 'result' };
let musicFor = null;
function syncMusic() {
  const want = SCREEN_MUSIC[screen] || null;
  if (want === musicFor) return;
  musicFor = want;
  if (want) Sound.playMusic(want); else Sound.stopMusic();
}

let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (ts - last) / 1000 || 0);
  last = ts;

  titleT += dt;
  if (screen === 'title' || screen === 'select') updateEmbers(dt);
  if (screen === 'title') {
    if (pressed.has('KeyW') || pressed.has('ArrowUp') ||
        pressed.has('KeyS') || pressed.has('ArrowDown')) { menuIdx = (menuIdx + 1) % 2; Sound.sfx('uiMove'); }
    mode = menuIdx === 0 ? 'cpu' : '2p';
  }
  if (screen === 'select') { syncPreview(0, dt); syncPreview(1, dt); }
  if (screen === 'vs') {
    vsT += dt;
    if (vsT > (reduceMotion ? .5 : 3.05)) startBattle();
  }
  if (screen === 'battle') updateBattle(dt);
  if (Sound.isReady()) syncMusic();

  ctx.save();
  if (shakeMag > 0) ctx.translate((Math.random() - .5) * shakeMag, (Math.random() - .5) * shakeMag);
  ctx.clearRect(-20, -20, W + 40, H + 40);
  if (screen === 'title') drawTitle();
  else if (screen === 'select') drawSelect();
  else if (screen === 'vs') drawVS();
  else if (screen === 'result') drawResult();
  else {
    drawStage();
    drawProjectiles();
    drawFighters();
    drawFgProjectiles();
    drawBattleHUD();
  }
  ctx.restore();

  pressed.clear();
}

addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now(); });


loadAll().then(() => {
  boot.classList.add('hidden');
  seedEmbers();
  // Direct preview route for art review and automated visual regression captures.
  const previewParams = new URLSearchParams(location.search);
  const previewScreen = previewParams.get('screen');
  const previewP1 = Number(previewParams.get('p1'));
  const previewP2 = Number(previewParams.get('p2'));
  if (Number.isInteger(previewP1) && ROSTER[previewP1]) sel.p1 = sel.cursor[0] = previewP1;
  if (Number.isInteger(previewP2) && ROSTER[previewP2]) sel.p2 = sel.cursor[1] = previewP2;
  if (previewScreen === 'select') advance();
  if (previewScreen === 'vs') { screen = 'vs'; vsT = .72; }
  if (previewScreen === 'battle') {
    startBattle();
    const previewSpecial = Number(previewParams.get('special'));
    if (previewParams.has('special') && fighters[0].def.specials[previewSpecial]) {
      roundState = 'fight'; fighters[0].meter = MAX_METER;
      startSpecial(fighters[0], fighters[0].def.specials[previewSpecial]);
    }
  }
  requestAnimationFrame(frame);
}).catch(err => {
  boot.innerHTML = `<div class="err"><b>Could not load assets</b><br>${err.message}<br><br>
    Serve this folder over HTTP (<code>python3 -m http.server 8099</code>) — opening the file
    directly blocks the manifest fetch.</div>`;
});
