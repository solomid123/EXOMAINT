/* =========================================================
   ExoMaintenance — Scroll Sequence Driver
   ========================================================= */
(() => {
  const FRAME_COUNT = 240;
  const FRAME_PATH  = (i) => `ezgif-frame-${String(i).padStart(3, '0')}.jpg`;

  const canvas = document.getElementById('sequence');
  const track  = document.querySelector('.hero-track');
  const sticky = document.querySelector('.hero-sticky');

  // The scroll-sequence only exists on the homepage. On every other page we
  // skip straight to the reveal-on-scroll observer at the bottom of this file.
  const HAS_SEQUENCE = !!(canvas && track && sticky);

  const ctx = HAS_SEQUENCE ? canvas.getContext('2d', { alpha: true }) : null;
  const copy   = document.querySelector('.hero-copy');
  const story  = document.querySelector('.hero-story');
  const storyLines = story ? Array.from(story.querySelectorAll('.story-lines li')) : [];
  const heroCta = document.querySelector('.hero-cta-panel');
  const cards  = document.querySelector('.float-cards');
  const phaseValue = document.getElementById('phaseValue');
  const phaseFill  = document.getElementById('phaseFill');

  if (HAS_SEQUENCE) { initSequence(); }
  initReveal();

  function initSequence() {

  /* -----------------------------
     Canvas sizing (DPR-aware)
     ----------------------------- */
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    const w = sticky.clientWidth, h = sticky.clientHeight;
    canvas.width  = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw(currentFrame | 0);
  }
  window.addEventListener('resize', resize);

  /* -----------------------------
     Image loading (progressive)
     ----------------------------- */
  const images = new Array(FRAME_COUNT);
  let loaded = 0;

  function loadImage(i) {
    return new Promise((res) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload  = () => { images[i] = img; loaded++; res(); };
      img.onerror = () => { loaded++; res(); };
      img.src = FRAME_PATH(i + 1);
    });
  }

  // Prioritise: first frame, then every 4th to give coverage, then fill the rest.
  async function preload() {
    await loadImage(0);
    draw(0);

    const queue = [];
    for (let i = 4; i < FRAME_COUNT; i += 4) queue.push(i);
    for (let i = 1; i < FRAME_COUNT; i++) if (i % 4 !== 0) queue.push(i);

    // Parallel-ish loading (cap concurrency to keep the main thread happy)
    const CONCURRENCY = 8;
    let idx = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (idx < queue.length) {
        const n = queue[idx++];
        await loadImage(n);
      }
    });
    await Promise.all(workers);
  }

  /* -----------------------------
     Draw a frame with 'cover' fit
     ----------------------------- */
  function draw(i) {
    // Walk back to nearest loaded frame if the exact one isn't in yet.
    let img = images[i];
    if (!img) {
      for (let k = i; k >= 0; k--) { if (images[k]) { img = images[k]; break; } }
      if (!img) for (let k = i; k < FRAME_COUNT; k++) { if (images[k]) { img = images[k]; break; } }
      if (!img) return;
    }

    const cw = sticky.clientWidth, ch = sticky.clientHeight;
    ctx.clearRect(0, 0, cw, ch);

    // Cover fit
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih) * 1.04; // slight zoom for parallax headroom
    const w = iw * scale, h = ih * scale;
    const x = (cw - w) / 2 + parallaxX;
    const y = (ch - h) / 2 + parallaxY;

    ctx.drawImage(img, x, y, w, h);

    // Dark vignette + blend the image's grey/white background into charcoal
    // Corner darkening
    const grad = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch)*0.35, cw/2, ch/2, Math.max(cw,ch)*0.8);
    grad.addColorStop(0, 'rgba(10,11,13,0)');
    grad.addColorStop(1, 'rgba(10,11,13,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle top/bottom falloffs for cinematic framing
    const topG = ctx.createLinearGradient(0, 0, 0, ch*0.25);
    topG.addColorStop(0, 'rgba(10,11,13,0.65)');
    topG.addColorStop(1, 'rgba(10,11,13,0)');
    ctx.fillStyle = topG; ctx.fillRect(0, 0, cw, ch*0.25);

    const botG = ctx.createLinearGradient(0, ch*0.72, 0, ch);
    botG.addColorStop(0, 'rgba(10,11,13,0)');
    botG.addColorStop(1, 'rgba(10,11,13,0.9)');
    ctx.fillStyle = botG; ctx.fillRect(0, ch*0.72, cw, ch*0.28);

    // Adaptive scrim: tames bright FEA studio-white backgrounds without crushing the car.
    // Max wash ~0.42 alpha at p≈0.5; a soft radial keeps the subject luminous.
    if (scrim > 0.001) {
      const wash = 0.42 * scrim;
      const sg = ctx.createRadialGradient(cw/2, ch*0.55, Math.min(cw,ch)*0.15,
                                          cw/2, ch*0.55, Math.max(cw,ch)*0.7);
      sg.addColorStop(0, `rgba(10,11,13,${(wash*0.55).toFixed(3)})`);
      sg.addColorStop(1, `rgba(10,11,13,${(wash).toFixed(3)})`);
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  /* -----------------------------
     Scroll progress → frame (lerped)
     ----------------------------- */
  let targetFrame  = 0;
  let currentFrame = 0;
  let parallaxX = 0, parallaxY = 0;
  let tParX = 0, tParY = 0;
  let scrimTarget = 0, scrim = 0;   // 0..1 extra darkening (stronger during bright FEA frames)

  function onScroll() {
    const rect = track.getBoundingClientRect();
    const vh   = window.innerHeight;
    const total = rect.height - vh;
    const scrolled = Math.min(Math.max(-rect.top, 0), total);
    const p = total > 0 ? scrolled / total : 0;       // 0..1

    targetFrame = p * (FRAME_COUNT - 1);

    // Parallax targets — very subtle, Apple-style
    tParX = (p - 0.5) * 30;      // ±15px
    tParY = (p - 0.5) * -18;

    // Scrim ramp: bright FEA middle frames (~p = 0.35–0.70) push toward full darkening
    // so the white studio background of those frames dissolves into charcoal.
    const d = Math.max(0, 1 - Math.abs(p - 0.5) / 0.22);  // triangular bump around p=0.5
    scrimTarget = Math.min(1, d);

    // Phase logic (labels in French)
    const phaseIdx = Math.round(p * (FRAME_COUNT - 1)) + 1;
    let label = 'SOLIDE';
    if (p > 0.25 && p <= 0.45) label = 'DÉSASSEMBLAGE';
    else if (p > 0.45 && p <= 0.60) label = 'FEA · MAILLAGE';
    else if (p > 0.60 && p <= 0.80) label = 'RÉASSEMBLAGE';
    else if (p > 0.80) label = 'RÉSOLU';
    phaseValue.textContent = `${label} · ${String(phaseIdx).padStart(3,'0')}`;
    phaseFill.style.width = (p * 100).toFixed(1) + '%';

    // ACT 1 — Hero intro copy: fades out as the chassis begins moving
    const copyFade = Math.max(0, 1 - p / 0.11);
    copy.style.opacity = copyFade.toFixed(3);
    copy.style.transform = `translateY(${(1 - copyFade) * -30}px)`;

    // ACT 2 — Narrative "story" panel during disassemble phase
    if (story) {
      const storyOn = p > 0.12 && p < 0.36;
      story.classList.toggle('show', storyOn);
      // Line-by-line reveal driven by each <li data-show="...">
      for (const li of storyLines) {
        const threshold = parseFloat(li.dataset.show) || 0;
        li.classList.toggle('in', storyOn && p >= threshold);
      }
    }

    // ACT 3 — Glass cards during exploded / FEA phase
    const cardsOn = p > 0.40 && p < 0.68;
    cards.classList.toggle('show', cardsOn);

    // ACT 4 — Final CTA on the reassembled/resolved frames
    if (heroCta) {
      heroCta.classList.toggle('show', p > 0.80);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* -----------------------------
     RAF loop — lerp for buttery smoothness
     ----------------------------- */
  function tick() {
    // Ease toward target (classic low-pass)
    currentFrame += (targetFrame - currentFrame) * 0.12;
    parallaxX    += (tParX - parallaxX) * 0.08;
    parallaxY    += (tParY - parallaxY) * 0.08;
    scrim        += (scrimTarget - scrim) * 0.1;

    const idx = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(currentFrame)));
    draw(idx);

    requestAnimationFrame(tick);
  }

  /* -----------------------------
     Boot
     ----------------------------- */
  resize();
  onScroll();
  requestAnimationFrame(tick);
  preload();

  } // end initSequence

  /* -----------------------------
     Reveal on scroll for sections (runs on every page)
     ----------------------------- */
  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.style.opacity = 1;
          e.target.style.transform = 'translateY(0)';
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12 });

    document.querySelectorAll('.section, .clients, .cap, .m, .process li, .tile, .page-hero, .page-body > *')
      .forEach((el) => {
        el.style.opacity = 0;
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1)';
        io.observe(el);
      });
  }
})();
