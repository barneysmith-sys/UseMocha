(function () {
  const canvases = document.querySelectorAll("canvas.range");
  if (!canvases.length) return;

  fetch("/terrain/alpine.bin")
    .then((response) => response.arrayBuffer())
    .then((buffer) => paint(canvases, decode(buffer)))
    .catch(() => {});

  function decode(buffer) {
    const view = new DataView(buffer);
    const count = view.getUint32(4, true);
    const points = [];
    for (let i = 0; i < count; i++) {
      const offset = 12 + i * 10;
      const alpha = view.getUint8(offset + 5) / 255;
      if (alpha < 0.22 && view.getUint8(offset + 6) === 0) continue;
      points.push({
        u: view.getUint16(offset, true) / 65535,
        v: view.getUint16(offset + 2, true) / 65535,
        size: (view.getUint8(offset + 4) / 255) * 7.5 + 0.6,
        alpha,
        square: view.getUint8(offset + 6) > 0,
      });
    }
    return points;
  }

  function paint(nodes, points) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.forEach((canvas) => loop(canvas, points, reduced));
  }

  function loop(canvas, points, reduced) {
    const ctx = canvas.getContext("2d", { alpha: true });
    const frame = (time) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const aspect = 2056 / 765;
      let planeW = width * 1.05;
      let planeH = planeW / aspect;
      if (planeH < height * 0.9) {
        const scale = Math.min((height * 0.98) / planeH, width < 720 ? 1.55 : 1.08);
        planeW *= scale;
        planeH *= scale;
      }
      const drift = reduced ? 0 : Math.sin(time * 0.00016) * width * 0.03;
      const x0 = (width - planeW) / 2 + drift;
      const y0 = (height - planeH) / 2;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const x = x0 + point.u * planeW;
        const y = y0 + point.v * planeH;
        ctx.globalAlpha = point.alpha;
        if (point.square) ctx.fillRect(x, y, point.size, point.size);
        else {
          ctx.beginPath();
          ctx.arc(x, y, point.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (!reduced) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
})();
