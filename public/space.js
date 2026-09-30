// One small canvas; no timers or rendering while Home is hidden.
export function initializeSpace(home, canvas) {
  const context = canvas?.getContext('2d');
  if (!context) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: -1000, y: -1000 };
  let stars = [], width = 0, height = 0, frame = 0, previous = 0;
  const visible = () => !home.hidden && !document.hidden;
  function draw() {
    context.clearRect(0, 0, width, height);
    context.lineWidth = .65;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const other = stars[j];
        const distance = Math.hypot(star.x - other.x, star.y - other.y);
        if (distance >= 115) continue;
        context.strokeStyle = 'rgba(161,195,230,' + (.13 * (1 - distance / 115)) + ')';
        context.beginPath(); context.moveTo(star.x, star.y); context.lineTo(other.x, other.y); context.stroke();
      }
      context.fillStyle = 'rgba(213,233,255,' + star.opacity + ')';
      context.beginPath(); context.arc(star.x, star.y, star.radius, 0, Math.PI * 2); context.fill();
    }
  }
  function tick(time) {
    frame = 0;
    if (!visible() || reduced.matches) return;
    // Limit to 30 frames per second; spring motion depends on elapsed time.
    if (time - previous >= 32) {
      const dt = Math.min((time - previous) / 33.33, 2);
      previous = time;
      for (const star of stars) {
        const dx = star.x - pointer.x, dy = star.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 150) {
          const force = (1 - distance / 150) * 1.8;
          star.vx += dx / (distance || 1) * force * dt;
          star.vy += dy / (distance || 1) * force * dt;
        }
        star.vx += (star.originX - star.x) * .012 * dt;
        star.vy += (star.originY - star.y) * .012 * dt;
        const damping = Math.pow(.88, dt);
        star.vx *= damping; star.vy *= damping;
        star.x += star.vx * dt; star.y += star.vy * dt;
      }
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0;
    if (!visible()) return;
    resize();
    previous = performance.now();
    if (!reduced.matches) frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (!visible()) return;
    const w = home.clientWidth, h = home.clientHeight;
    if (w === width && h === height) return;
    width = w; height = h;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(90, Math.max(35, Math.round(w * h / 14500)));
    stars = Array.from({ length: count }, () => {
      const x = Math.random() * w, y = Math.random() * h;
      return { x, y, originX: x, originY: y, vx: 0, vy: 0, radius: .6 + Math.random() * 1.4, opacity: .24 + Math.random() * .5 };
    });
    draw();
  }
  home.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType === 'touch') return;
    const rect = home.getBoundingClientRect();
    pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
  }, { passive: true });
  home.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1000; });
  new ResizeObserver(resize).observe(home);
  new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  sync();
}
