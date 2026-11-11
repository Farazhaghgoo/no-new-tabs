let reset;
async function playPreview(mode) {
  clearTimeout(reset);
  const off = mode === 'off';
  const poster = document.getElementById('poster');
  const reduced = document.getElementById('reduced').checked || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = await NutsAnimation.play({ mode, mount: document.getElementById('stage'), reducedMotion: reduced });
  poster.hidden = Boolean(ok);
  const text = off
    ? (reduced ? 'Off duty. Motion kept quiet.' : 'Off duty.')
    : (reduced ? 'Your tabs are protected. Motion kept quiet.' : 'She\u2019s got your back.');
  document.getElementById('feedback').textContent = ok ? text : 'Could not load artwork. Keep the assets folder beside this preview.';
  reset = setTimeout(() => { poster.hidden = false; }, reduced ? 1250 : (off ? NutsAnimation.durationOff : NutsAnimation.duration) + 50);
}
document.getElementById('replay').addEventListener('click', () => playPreview('on'));
document.getElementById('replay-off').addEventListener('click', () => playPreview('off'));
