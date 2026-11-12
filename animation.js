// Shared by the extension overlay and the offline preview. No remote requests.
(() => {
  if (globalThis.NutsAnimation) return; // already loaded in this page
  let current = null;
  let generation = 0;
  let pending = null; // { ticket, mode } while artwork is still decoding
  const DURATION = 2600;
  const DURATION_OFF = 2600;
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
    .caption { position:absolute; bottom:-22px; left:50%; transform:translateX(-50%); white-space:nowrap; z-index:3;
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
    /* Switch-off: one sad pose from start to finish, in her own muted colours.
       She appears already sad, slumps with a sigh, then trudges off to the right
       while the ad slides back in. */
    .scene[data-mode="off"] .character { animation:departure 2600ms cubic-bezier(.45,.05,.35,1) both; }
    /* The ad pops back in on the left, in the spot she is leaving. */
    .scene[data-mode="off"] .ad { z-index:3; left:4%; right:auto; top:12%; animation:return 2600ms both; }
    .scene[data-mode="off"] .caption { z-index:5; background:#374151; animation:caption-off 2600ms both; }
    .scene[data-mode="off"] .sad { opacity:1; transform-origin:50% 96%; }
    .scene[data-phase="leave"] .sad { animation:trudge 460ms ease-in-out infinite; }
    .quiet[data-mode="off"] { background:#374151; }
    @keyframes departure {
      0% { opacity:0; transform:translateY(14px) scale(.94); }
      9%,23% { opacity:1; transform:translateY(0) scale(1); }
      30% { transform:translateY(8px) scale(.965); }
      36%,44% { transform:translateY(5px) scale(.97); }
      92% { opacity:1; transform:translate(150px,5px) scale(.97); }
      100% { opacity:0; transform:translate(175px,5px) scale(.97); }
    }
    @keyframes trudge {
      0%,50%,100% { transform:translateY(0) rotate(0); }
      25% { transform:translateY(-5px) rotate(-1.6deg); }
      75% { transform:translateY(-5px) rotate(1.6deg); }
    }
    @keyframes return {
      0%,44% { opacity:0; transform:translateX(-90px) rotate(-10deg); }
      52% { opacity:1; transform:translateX(8px) rotate(6deg); }
      58% { opacity:1; transform:translateX(-4px) rotate(-4deg); }
      64%,90% { opacity:1; transform:translateX(0) rotate(0); }
      100% { opacity:0; transform:translateX(0) rotate(0); }
    }
    @keyframes caption-off { 0%,6% { opacity:0; } 16%,86% { opacity:1; } 100% { opacity:0; } }
    @media (prefers-reduced-motion:reduce) { * { animation:none!important; } }
  `;

  function mode() { return current?.mode ?? null; }

  // stop() always stops. stop({ mode }) only stops that kind of animation, so a
  // storage event can never kill the other mode's animation it just triggered.
  function stop(options) {
    const only = options?.mode;
    if (only) {
      const active = current?.mode ?? (pending && pending.ticket === generation ? pending.mode : null);
      if (active !== only) return;
    }
    generation++;
    pending = null;
    if (!current) return;
    current.timers.forEach(clearTimeout);
    current.host.remove();
    document.removeEventListener('keydown', current.escape);
    current = null;
  }

  async function play({ mode = 'on', assetURL = (path) => path, mount, reducedMotion } = {}) {
    stop();
    mode = mode === 'off' ? 'off' : 'on';
    const off = mode === 'off';
    const ticket = generation;
    pending = { ticket, mode };
    const reduced = reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    const images = [];
    if (!reduced) {
      const poses = off ? [['off', 'sad']]
        : ['approach', 'block', 'offer', 'hearts'].map((name) => [name, name]);
      for (const [file, pose] of poses) {
        const img = new Image();
        img.className = `pose ${pose}`;
        img.alt = '';
        img.src = assetURL(`assets/animation/${file}.png`);
        images.push(img);
      }
      try { await Promise.all(images.map((img) => img.decode())); }
      catch { return false; } // Artwork failure never affects protection.
    }
    if (ticket !== generation || !document.documentElement) return false;
    pending = null;
    const first = off ? 'sad' : 'approach';
    const host = document.createElement('nuts-activation');
    host.dataset.mode = mode;
    host.dataset.phase = reduced ? 'quiet' : first;
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
    scene.dataset.mode = mode;
    if (reduced) scene.textContent = off ? 'NUTS is off. Pop-ups can get through.' : '✓ NUTS is protecting your tabs';
    else {
      scene.dataset.phase = first;
      const character = document.createElement('div');
      character.className = 'character';
      character.append(...images);
      const ad = document.createElement('div');
      ad.className = 'ad'; ad.textContent = 'AD'; ad.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('div');
      caption.className = 'caption'; caption.textContent = off ? 'Off duty. Pop-ups can get through.' : 'Your tabs. Your rules.';
      scene.append(ad, character, caption);
    }
    const dismiss = document.createElement('button');
    dismiss.type = 'button'; dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss NUTS animation');
    dismiss.addEventListener('click', () => stop());
    root.append(scene, dismiss);
    (mount || document.documentElement).append(host);
    const escape = (event) => { if (event.key === 'Escape') stop(); };
    document.addEventListener('keydown', escape);
    current = { host, mode, timers: [], escape };
    const later = (fn, delay) => current.timers.push(setTimeout(fn, delay));
    later(() => { status.textContent = off ? 'NUTS is off' : 'NUTS is protecting your tabs'; }, 30);
    if (!reduced) {
      const steps = off ? [['sigh', 600], ['leave', 1150]] : [['block', 620], ['offer', 1120], ['hearts', 1700]];
      for (const [phase, delay] of steps) {
        later(() => { host.dataset.phase = scene.dataset.phase = phase; }, delay);
      }
    }
    later(() => stop(), reduced ? 1200 : off ? DURATION_OFF : DURATION);
    return true;
  }
  globalThis.NutsAnimation = { play, stop, mode, duration: DURATION, durationOff: DURATION_OFF };
})();
