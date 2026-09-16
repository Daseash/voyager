/**
 * Skiper 73: Infinite Canvas
 * Seamless 2D infinite scrolling grid with momentum physics,
 * pointer drag, mouse wheel support, and zoom/fullscreen HUD.
 */

(function () {
  'use strict';

  function wrapCoord(val, min, max) {
    const range = max - min;
    return ((((val - min) % range) + range) % range) + min;
  }

  function initSkiper73Canvas(wrapper) {
    if (!wrapper || wrapper.dataset.skiper73Initialized) return;
    wrapper.dataset.skiper73Initialized = 'true';

    const plane = wrapper.querySelector('.skiper73-plane');
    const templateContainer = wrapper.querySelector('.skiper73-templates');
    const hintBadge = wrapper.querySelector('.skiper73-hint');
    const compassBadge = wrapper.querySelector('.skiper73-compass-text');

    if (!plane) return;

    // Read initial data from template cards
    const rawTiles = Array.from(
      (templateContainer || wrapper).querySelectorAll('.skiper73-tile-data')
    ).map((el) => ({
      id: el.dataset.id || '',
      url: el.dataset.url || `/listings/${el.dataset.id}`,
      title: el.dataset.title || 'Beautiful Stay',
      location: el.dataset.location || 'Explore',
      country: el.dataset.country || '',
      price: el.dataset.price || '0',
      rating: el.dataset.rating || '',
      category: el.dataset.category || 'Stay',
      image: el.dataset.image || 'https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=800&q=60'
    }));

    if (rawTiles.length === 0) return;

    // Metrics
    const isMobile = window.innerWidth < 768;
    const tileW = isMobile ? 260 : 320;
    const tileH = isMobile ? 200 : 240;
    const gapX = isMobile ? 18 : 24;
    const gapY = isMobile ? 18 : 24;
    const cellW = tileW + gapX;
    const cellH = tileH + gapY;

    let viewW = wrapper.clientWidth || 1000;
    let viewH = wrapper.clientHeight || 600;

    // Compute grid dimensions to ensure seamless infinite coverage
    let cols = Math.max(6, Math.ceil(viewW / cellW) + 3);
    let rows = Math.max(4, Math.ceil(viewH / cellH) + 3);
    let totalW = cols * cellW;
    let totalH = rows * cellH;

    // Clear plane and build tile DOM elements
    plane.innerHTML = '';
    const tileElements = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const itemIdx = (r * cols + c) % rawTiles.length;
        const item = rawTiles[itemIdx];

        const tile = document.createElement('div');
        tile.className = 'skiper73-tile';
        tile.dataset.url = item.url;
        tile.style.width = `${tileW}px`;
        tile.style.height = `${tileH}px`;

        const ratingMarkup = item.rating
          ? `<span class="skiper73-tile-pill"><i class="fa-solid fa-star"></i> ${Number(item.rating).toFixed(1)}</span>`
          : `<span class="skiper73-tile-pill"><i class="fa-solid fa-sparkles"></i> New</span>`;

        tile.innerHTML = `
          <img class="skiper73-tile-img" src="${item.image}" alt="${item.title}" loading="lazy" draggable="false" />
          ${ratingMarkup}
          <div class="skiper73-tile-overlay">
            <span class="skiper73-tile-location">${item.location}${item.country ? ', ' + item.country : ''}</span>
            <h4 class="skiper73-tile-title">${item.title}</h4>
            <div class="skiper73-tile-footer">
              <span class="skiper73-tile-price">&#8377;${item.price} <span>/ night</span></span>
              <span class="skiper73-tile-cta">View <i class="fa-solid fa-arrow-right-long"></i></span>
            </div>
          </div>
        `;

        plane.appendChild(tile);

        tileElements.push({
          el: tile,
          baseX: c * cellW,
          baseY: r * cellH,
          url: item.url
        });
      }
    }

    // Camera & Physics state
    let camX = 0;
    let camY = 0;
    let targetX = 0;
    let targetY = 0;
    let vx = 0;
    let vy = 0;
    let scale = 1;
    let targetScale = 1;

    let isPointerDown = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let dragDistance = 0;
    let hasInteracted = false;

    // Resize handler
    function onResize() {
      viewW = wrapper.clientWidth || 1000;
      viewH = wrapper.clientHeight || 600;
      const newCols = Math.max(6, Math.ceil(viewW / cellW) + 3);
      const newRows = Math.max(4, Math.ceil(viewH / cellH) + 3);
      if (newCols !== cols || newRows !== rows) {
        // Re-init on significant geometry change
        wrapper.dataset.skiper73Initialized = '';
        initSkiper73Canvas(wrapper);
      } else {
        totalW = cols * cellW;
        totalH = rows * cellH;
      }
    }
    window.addEventListener('resize', onResize);

    // Pointer events for dragging
    wrapper.addEventListener('pointerdown', (e) => {
      // Don't hijack clicks on HUD buttons
      if (e.target.closest('.skiper73-hud')) return;

      isPointerDown = true;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      dragDistance = 0;
      vx = 0;
      vy = 0;

      wrapper.classList.add('is-dragging');
      try {
        wrapper.setPointerCapture(e.pointerId);
      } catch (err) {}

      if (hintBadge && !hasInteracted) {
        hasInteracted = true;
        hintBadge.classList.add('is-faded');
      }
    });

    wrapper.addEventListener('pointermove', (e) => {
      if (!isPointerDown) return;

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      dragDistance += Math.hypot(dx, dy);

      // Instantaneous velocity (px/ms)
      const instantVx = (dx / dt) * 16;
      const instantVy = (dy / dt) * 16;
      vx = vx * 0.4 + instantVx * 0.6;
      vy = vy * 0.4 + instantVy * 0.6;

      targetX += dx / scale;
      targetY += dy / scale;
      camX += dx / scale;
      camY += dy / scale;

      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = now;
    });

    function onPointerUp(e) {
      if (!isPointerDown) return;
      isPointerDown = false;
      wrapper.classList.remove('is-dragging');

      try {
        wrapper.releasePointerCapture(e.pointerId);
      } catch (err) {}

      // Clamp max release velocity
      const maxV = 35;
      vx = Math.max(-maxV, Math.min(maxV, vx));
      vy = Math.max(-maxV, Math.min(maxV, vy));
    }

    wrapper.addEventListener('pointerup', onPointerUp);
    wrapper.addEventListener('pointercancel', onPointerUp);

    // Tile Click Detection (separate click from drag)
    wrapper.addEventListener('click', (e) => {
      if (dragDistance > 6) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const tile = e.target.closest('.skiper73-tile');
      if (tile && tile.dataset.url) {
        window.location.href = tile.dataset.url;
      }
    });

    // Mouse wheel support for 2D panning
    wrapper.addEventListener(
      'wheel',
      (e) => {
        // If holding Ctrl or Meta, handle zoom
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          targetScale -= e.deltaY * 0.0015;
          targetScale = Math.max(0.7, Math.min(1.4, targetScale));
          return;
        }

        // Pan with mouse wheel
        e.preventDefault();
        const factor = 0.85;
        targetX -= (e.deltaX * factor) / scale;
        targetY -= (e.deltaY * factor) / scale;

        vx -= (e.deltaX * 0.08) / scale;
        vy -= (e.deltaY * 0.08) / scale;

        if (hintBadge && !hasInteracted) {
          hasInteracted = true;
          hintBadge.classList.add('is-faded');
        }
      },
      { passive: false }
    );

    // HUD controls: Zoom In, Zoom Out, Recenter, Fullscreen
    const btnZoomIn = wrapper.querySelector('[data-skiper73-action="zoom-in"]');
    const btnZoomOut = wrapper.querySelector('[data-skiper73-action="zoom-out"]');
    const btnRecenter = wrapper.querySelector('[data-skiper73-action="recenter"]');
    const btnFullscreen = wrapper.querySelector('[data-skiper73-action="fullscreen"]');

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        targetScale = Math.min(1.35, targetScale + 0.15);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        targetScale = Math.max(0.75, targetScale - 0.15);
      });
    }

    if (btnRecenter) {
      btnRecenter.addEventListener('click', (e) => {
        e.stopPropagation();
        targetScale = 1;
        vx = 0;
        vy = 0;
        if (window.gsap) {
          window.gsap.to(
            { x: camX, y: camY, s: scale },
            {
              x: 0,
              y: 0,
              s: 1,
              duration: 0.8,
              ease: 'power3.out',
              onUpdate: function () {
                camX = this.targets()[0].x;
                camY = this.targets()[0].y;
                targetX = camX;
                targetY = camY;
                scale = this.targets()[0].s;
                targetScale = scale;
              }
            }
          );
        } else {
          camX = 0;
          camY = 0;
          targetX = 0;
          targetY = 0;
        }
      });
    }

    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        const isFull = wrapper.classList.toggle('is-fullscreen');
        const icon = btnFullscreen.querySelector('i');
        if (icon) {
          icon.className = isFull ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
        }
        if (isFull) {
          document.body.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
        }
        setTimeout(onResize, 50);
      });
    }

    // Main animation & render loop
    let animId;
    function tick() {
      // Apply momentum physics
      if (!isPointerDown) {
        vx *= 0.94;
        vy *= 0.94;
        if (Math.abs(vx) < 0.01) vx = 0;
        if (Math.abs(vy) < 0.01) vy = 0;

        camX += vx;
        camY += vy;
        targetX = camX;
        targetY = camY;
      } else {
        camX += (targetX - camX) * 0.35;
        camY += (targetY - camY) * 0.35;
      }

      // Smooth zoom interpolation
      scale += (targetScale - scale) * 0.15;
      plane.style.transform = `scale(${scale})`;

      // Update speed compass
      if (compassBadge) {
        const speed = Math.round(Math.hypot(vx, vy) * 10);
        compassBadge.textContent = `${speed > 0 ? speed + ' px/s' : 'Explore'}`;
      }

      // Continuous seamless modulo wrapping
      const minX = -cellW;
      const maxX = totalW - cellW;
      const minY = -cellH;
      const maxY = totalH - cellH;

      for (let i = 0; i < tileElements.length; i++) {
        const t = tileElements[i];
        const screenX = wrapCoord(t.baseX + camX, minX, maxX);
        const screenY = wrapCoord(t.baseY + camY, minY, maxY);

        t.el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);

    // Cleanup when DOM disconnected
    const observer = new MutationObserver(() => {
      if (!document.body.contains(wrapper)) {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Auto-initialize on DOM ready
  function initAll() {
    const canvases = document.querySelectorAll('[data-skiper73-canvas]');
    canvases.forEach(initSkiper73Canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Expose global initializer for dynamic PJAX / route transitions
  window.initSkiper73Canvas = initSkiper73Canvas;
})();
