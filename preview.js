let reset;
document.getElementById('replay').addEventListener('click', async () => {
  clearTimeout(reset);
  const poster = document.getElementById('poster');
  const reduced = document.getElementById('reduced').checked || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = await NutsAnimation.play({ mount: document.getElementById('stage'), reducedMotion: reduced });
  poster.hidden = Boolean(ok);
  document.getElementById('feedback').textContent = ok ? (reduced ? 'Protection on. Motion kept quiet.' : 'She’s got your back.') : 'Could not load artwork. Keep the assets folder beside this preview.';
  reset = setTimeout(() => { poster.hidden = false; }, reduced ? 1250 : NutsAnimation.duration + 50);
});
