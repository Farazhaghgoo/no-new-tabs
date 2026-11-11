// Shared by the extension overlay and the offline preview. No remote requests.
(() => {
  let current = null;
  let generation = 0;
  const DURATION = 2600;
  const styles = `
    :host { all:initial; position:fixed; top:18px; right:18px; width:min(320px,calc(100vw - 36px));
      z-index:2147483647; pointer-events:none; color:#fff; font:14px/1.4 system-ui,sans-serif; }
    * { box-sizing:border-box; }
    .scene { position:relative; width:100%; aspect-ratio:1; isolation:isolate; }
    .character { position:absolute; inset:0; z-index:2; transform-origin:50% 90%;
      animation:arrival 2600ms cubic-bezier(.2,.7,.2,1) both; }
    .pose { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:0; }
    [data-phase="approach"] .approach, [data-phase="block"] .block,
    [data-phase="offer"] .offer, [data-phase="hearts"] .hearts { opacity:1; }
    .ad { position:absolute; right:0; top:22%; width:23%; height:23%; border:2px solid #f65d50;
      background:#f5f5f4; border-radius:9px; z-index:1; color:#a52c23; font-weight:800;
      display:grid; place-items:center; box-shadow:0 5px 18px #0002; animation:reject 2600ms both; }
    .ad:before { content:'•••'; position:absolute; top:0; left:0; right:0; height:17px;
      background:#f65d50; color:white; font-size:12px; padding-left:5px; border-radius:6px 6px 0 0; }
    .caption { position:absolute; bottom:-22px; left:50%; transform:translateX(-50%); white-space:nowrap;
      padding:8px 15px; border-radius:24px; background:#123322; color:#fff; box-shadow:0 4px 18px #0002;
      font-weight:650; animation:caption 2600ms both; }
    button { position:absolute; right:0; top:0; width:28px; height:28px; border:1px solid #ffffff50;
      border-radius:50%; background:#17251ee6; color:#fff; font:20px/1 system-ui; cursor:pointer;
      pointer-events:auto; z-index:4; }
    button:focus-visible { outline:3px solid #16a34a; outline-offset:3px; }
    .status { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
    .quiet { padding:12px 18px; border-radius:20px; background:#123322; text-align:center; font-weight:650; }
    @keyframes arrival {
      0% { opacity:0; transform:translateY(24px) scale(.48); }
      20% { opacity:1; transform:translateY(0) scale(.9); }
      25% { transform:translateX(-5px) scale(.94); }
      37% { transform:translateX(3px) scale(1); }
      54% { transform:translateY(-3px) scale(1.035); }
      81% { opacity:1; transform:translateY(0) scale(1.035); }
      100% { opacity:0; transform:translateY(12px) scale(.94); }
    }
    @keyframes reject {
      0% { opacity:0; transform:translateX(75px) rotate(12deg); }
      15%,27% { opacity:1; transform:translateX(-18px) rotate(-9deg); }
      40%,100% { opacity:0; transform:translate(120px,-45px) rotate(38deg) scale(.7); }
    }
    @keyframes caption { 0%,18% { opacity:0; } 30%,82% { opacity:1; } 100% { opacity:0; } }
    @media (prefers-reduced-motion:reduce) { * { animation:none!important; } }
  `;

  function stop() {
    generation++;
    if (!current) return;
    current.timers.forEach(clearTimeout);
    current.host.remove();
    document.removeEventListener('keydown', current.escape);
    current = null;
  }

  async function play({ assetURL = (path) => path, mount, reducedMotion } = {}) {
    stop();
    const ticket = generation;
    const reduced = reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    const images = [];
    if (!reduced) {
      for (const pose of ['approach', 'block', 'offer', 'hearts']) {
        const img = new Image();
        img.className = `pose ${pose}`;
        img.alt = '';
        img.src = assetURL(`assets/animation/${pose}.png`);
        images.push(img);
      }
      try { await Promise.all(images.map((img) => img.decode())); }
      catch { return false; } // Artwork failure never affects protection.
    }
    if (ticket !== generation || !document.documentElement) return false;
    const host = document.createElement('nuts-activation');
    host.dataset.phase = reduced ? 'quiet' : 'approach';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = styles;
    root.append(style);
    if (mount) host.style.cssText = 'position:absolute;inset:0;width:100%;z-index:1;pointer-events:none';
    const status = document.createElement('div');
    status.className = 'status';
    status.setAttribute('role', 'status');
    root.append(status);
    const scene = document.createElement('div');
    scene.className = reduced ? 'quiet' : 'scene';
    if (reduced) scene.textContent = '✓ NUTS protection is on';
    else {
      scene.dataset.phase = 'approach';
      const character = document.createElement('div');
      character.className = 'character';
      character.append(...images);
      const ad = document.createElement('div');
      ad.className = 'ad'; ad.textContent = 'AD'; ad.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('div');
      caption.className = 'caption'; caption.textContent = 'Your tabs. Your rules.';
      scene.append(ad, character, caption);
    }
    const dismiss = document.createElement('button');
    dismiss.type = 'button'; dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss NUTS animation');
    dismiss.addEventListener('click', stop);
    root.append(scene, dismiss);
    (mount || document.documentElement).append(host);
    const escape = (event) => { if (event.key === 'Escape') stop(); };
    document.addEventListener('keydown', escape);
    current = { host, timers: [], escape };
    const later = (fn, delay) => current.timers.push(setTimeout(fn, delay));
    later(() => { status.textContent = 'NUTS protection is on'; }, 30);
    if (!reduced) {
      for (const [phase, delay] of [['block', 620], ['offer', 1120], ['hearts', 1700]]) {
        later(() => { host.dataset.phase = scene.dataset.phase = phase; }, delay);
      }
    }
    later(stop, reduced ? 1200 : DURATION);
    return true;
  }
  globalThis.NutsAnimation = { play, stop, duration: DURATION };
})();
