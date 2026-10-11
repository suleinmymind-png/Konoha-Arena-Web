// Konoha Arena — procedural arcade audio.
// Everything is synthesised at runtime with Web Audio: no sample files, no licensing.
// Music leans on a pelog-flavoured scale so the menus carry a gamelan colour.

const Sound = (() => {
  let ctx = null, master = null, musicBus = null, sfxBus = null;
  let ready = false, muted = false;
  let track = null, nextStep = 0, stepTime = 0, timer = null;

  // ---------------------------------------------------------------- setup

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.34; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.62; sfxBus.connect(master);
    ready = true;
  }

  /** Browsers hold the context suspended until a real gesture. */
  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // ---------------------------------------------------------------- voices

  function env(node, t, a, d, peak) {
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(t, freq, dur, { type = 'square', gain = .2, bus = sfxBus,
                                slideTo = null, detune = 0, attack = .006 } = {}) {
    if (!ready) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    env(g, t, attack, dur, gain);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + .05);
  }

  let noiseBuf = null;
  function noise(t, dur, { gain = .2, bus = sfxBus, hp = 400, lp = 6000, q = 1 } = {}) {
    if (!ready) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.loop = true;
    const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp; lpf.Q.value = q;
    const g = ctx.createGain();
    env(g, t, .004, dur, gain);
    s.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + .05);
  }

  /** Struck-metal timbre — the gamelan colour behind the menus. */
  function gong(t, freq, dur, gain = .18, bus = musicBus) {
    if (!ready) return;
    [1, 2.76, 5.4].forEach((mult, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * mult;
      env(g, t, .004, dur * (i === 0 ? 1 : .55), gain * (i === 0 ? 1 : .22 / i));
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + dur + .1);
    });
  }

  // ---------------------------------------------------------------- music

  const A4 = 440;
  const note = n => A4 * Math.pow(2, (n - 69) / 12);
  // pelog-ish degrees, and a minor pentatonic for the fight
  const PELOG = [0, 1, 3, 7, 8];
  const PENTA = [0, 3, 5, 7, 10];
  const deg = (scale, root, i) => {
    const oct = Math.floor(i / scale.length), s = scale[((i % scale.length) + scale.length) % scale.length];
    return note(root + s + oct * 12);
  };

  const TRACKS = {
    title: {
      bpm: 104, len: 16, scale: PELOG, root: 57,
      lead: [0, null, 2, null, 3, null, 2, null, 4, null, 3, null, 2, null, 0, null],
      bass: [0, null, null, null, -3, null, null, null, -1, null, null, null, -3, null, null, null],
      gongs: [0, null, null, null, null, null, null, null, 3, null, null, null, null, null, null, null],
      drums: 'k...s...k...s...',
    },
    select: {
      bpm: 126, len: 16, scale: PELOG, root: 59,
      lead: [4, 3, 2, 3, 4, null, 5, null, 4, 3, 2, 1, 0, null, 2, null],
      bass: [0, null, 0, null, -2, null, -2, null, -1, null, -1, null, -3, null, -3, null],
      gongs: [0, null, null, null, null, null, null, null, null, null, null, null, 2, null, null, null],
      drums: 'k.h.s.h.k.h.s.hh',
    },
    battle: {
      bpm: 152, len: 16, scale: PENTA, root: 45,
      lead: [0, 0, 3, 0, 4, 3, 0, null, 2, 2, 0, 2, 3, null, 4, 3],
      bass: [0, 0, null, 0, -2, null, 0, null, 1, 1, null, 1, -1, null, 0, null],
      gongs: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      drums: 'k.khs.khk.khs.kh',
    },
    result: {
      bpm: 108, len: 16, scale: PELOG, root: 60,
      lead: [0, 2, 4, 5, 4, null, 3, null, 2, 3, 4, null, 5, null, null, null],
      bass: [0, null, null, null, 0, null, null, null, -3, null, null, null, -1, null, null, null],
      gongs: [0, null, null, null, null, null, null, null, 4, null, null, null, null, null, null, null],
      drums: 'k...s...k...s..s',
    },
  };

  function scheduleStep(step, t) {
    const tr = track; if (!tr) return;
    const i = step % tr.len;
    const beat = stepTime;

    const L = tr.lead[i];
    if (L !== null && L !== undefined) {
      tone(t, deg(tr.scale, tr.root + 12, L), beat * 1.7,
           { type: 'square', gain: .07, bus: musicBus, attack: .008 });
      tone(t, deg(tr.scale, tr.root + 12, L), beat * 1.7,
           { type: 'triangle', gain: .045, bus: musicBus, detune: 7 });
    }
    const B = tr.bass[i];
    if (B !== null && B !== undefined) {
      tone(t, deg(tr.scale, tr.root - 12, B), beat * 2.1,
           { type: 'triangle', gain: .16, bus: musicBus, attack: .01 });
    }
    const G = tr.gongs[i];
    if (G !== null && G !== undefined) gong(t, deg(tr.scale, tr.root, G), 2.2, .13);

    const d = tr.drums[i];
    if (d === 'k') { tone(t, 150, .13, { type: 'sine', gain: .5, bus: musicBus, slideTo: 44 }); }
    if (d === 's') { noise(t, .14, { gain: .22, bus: musicBus, hp: 1400, lp: 7000 }); }
    if (d === 'h') { noise(t, .045, { gain: .09, bus: musicBus, hp: 6000, lp: 14000 }); }
  }

  function scheduler() {
    if (!ready || !track) return;
    const ahead = ctx.currentTime + .12;
    while (nextStep.time < ahead) {
      scheduleStep(nextStep.i, nextStep.time);
      nextStep.i++; nextStep.time += stepTime;
    }
  }

  function playMusic(name) {
    init();
    if (!ready) return;
    if (track && track.name === name) return;
    const tr = TRACKS[name];
    if (!tr) { stopMusic(); return; }
    track = Object.assign({ name }, tr);
    stepTime = 60 / tr.bpm / 2;                      // eighth notes
    nextStep = { i: 0, time: ctx.currentTime + .06 };
    if (!timer) timer = setInterval(scheduler, 25);
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(muted ? 0 : .34, ctx.currentTime, .12);
  }

  function stopMusic() {
    track = null;
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ---------------------------------------------------------------- sfx

  const S = {
    uiMove()    { const t = ctx.currentTime; tone(t, 620, .07, { type: 'square', gain: .16, slideTo: 760 }); },
    uiConfirm() { const t = ctx.currentTime;
                  [0, .07].forEach((o, i) => tone(t + o, i ? 1040 : 700, .13, { type: 'square', gain: .2 })); },
    uiBack()    { const t = ctx.currentTime; tone(t, 420, .1, { type: 'square', gain: .16, slideTo: 260 }); },
    lockIn()    { const t = ctx.currentTime;
                  gong(t, 330, 1.4, .3, sfxBus);
                  [0, .06, .12].forEach((o, i) => tone(t + o, 520 + i * 200, .12, { type: 'square', gain: .17 })); },
    whoosh()    { const t = ctx.currentTime; noise(t, .16, { gain: .14, hp: 700, lp: 3200, q: 3 }); },
    hitLight()  { const t = ctx.currentTime;
                  tone(t, 300, .1, { type: 'square', gain: .28, slideTo: 130 });
                  noise(t, .1, { gain: .3, hp: 900, lp: 8000 }); },
    hitHeavy()  { const t = ctx.currentTime;
                  tone(t, 190, .2, { type: 'sawtooth', gain: .34, slideTo: 62 });
                  noise(t, .2, { gain: .34, hp: 400, lp: 5200 }); },
    block()     { const t = ctx.currentTime;
                  tone(t, 1500, .09, { type: 'square', gain: .16, slideTo: 1100 });
                  noise(t, .09, { gain: .16, hp: 3000, lp: 12000 }); },
    jump()      { const t = ctx.currentTime; tone(t, 330, .16, { type: 'square', gain: .17, slideTo: 760 }); },
    land()      { const t = ctx.currentTime; noise(t, .08, { gain: .14, hp: 200, lp: 1600 }); },
    special()   { const t = ctx.currentTime;
                  for (let i = 0; i < 5; i++)
                    tone(t + i * .05, 300 + i * 160, .3, { type: 'sawtooth', gain: .13, slideTo: 400 + i * 220 });
                  noise(t, .5, { gain: .16, hp: 300, lp: 9000 }); },
    sticker()   { const t = ctx.currentTime;
                  [0, .05, .1].forEach((o, i) => tone(t + o, 780 + i * 260, .14, { type: 'square', gain: .2 })); },
    dozer()     { const t = ctx.currentTime;
                  tone(t, 62, 1.5, { type: 'sawtooth', gain: .2, slideTo: 48 });
                  noise(t, 1.5, { gain: .14, hp: 90, lp: 900 }); },
    fog()       { const t = ctx.currentTime; noise(t, 1.6, { gain: .18, hp: 200, lp: 1500 }); },
    throwHoe()  { const t = ctx.currentTime;
                  noise(t, .22, { gain: .16, hp: 900, lp: 5000, q: 4 });
                  tone(t, 900, .22, { type: 'square', gain: .1, slideTo: 420 }); },
    roots()     { const t = ctx.currentTime;
                  tone(t, 110, .4, { type: 'sawtooth', gain: .24, slideTo: 300 });
                  noise(t, .4, { gain: .16, hp: 200, lp: 2400 }); },
    swarm()     { const t = ctx.currentTime;
                  for (let i = 0; i < 8; i++)
                    tone(t + i * .07, 520 + Math.random() * 400, .07, { type: 'square', gain: .12 }); },
    roundStart(){ const t = ctx.currentTime;
                  gong(t, 262, 1.8, .34, sfxBus);
                  tone(t + .12, 660, .2, { type: 'square', gain: .2 }); },
    fight()     { const t = ctx.currentTime;
                  [0, .1, .2].forEach((o, i) => tone(t + o, 520 + i * 180, .22, { type: 'square', gain: .24 })); },
    ko()        { const t = ctx.currentTime;
                  tone(t, 420, .7, { type: 'sawtooth', gain: .34, slideTo: 60 });
                  noise(t, .7, { gain: .3, hp: 150, lp: 4000 });
                  gong(t + .05, 165, 2.4, .34, sfxBus); },
    win()       { const t = ctx.currentTime;
                  [0, 2, 4, 7].forEach((s, i) =>
                    tone(t + i * .11, note(60 + s), .4, { type: 'square', gain: .2 })); },
  };

  function sfx(name) {
    if (!ready || muted) return;
    const f = S[name];
    if (f) { try { f(); } catch (e) { /* a dropped sound must never break a frame */ } }
  }

  function setMuted(m) {
    muted = m;
    if (!ready) return;
    master.gain.setTargetAtTime(m ? 0 : .9, ctx.currentTime, .05);
  }
  const isMuted = () => muted;
  const isReady = () => ready && ctx && ctx.state === 'running';

  return { init, unlock, playMusic, stopMusic, sfx, setMuted, isMuted, isReady };
})();
