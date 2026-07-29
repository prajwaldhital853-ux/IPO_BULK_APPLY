const reveals = document.querySelectorAll('.reveal');
const heroVideo = document.querySelector('.hero-video');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.05,
    rootMargin: '120px 0px 80px 0px',
  },
);

reveals.forEach((node) => observer.observe(node));

if (heroVideo) {
  heroVideo.addEventListener('loadeddata', () => {
    heroVideo.classList.add('is-ready');
  });

  heroVideo.addEventListener('error', () => {
    heroVideo.classList.add('is-hidden');
  });
}

const SCREEN_SLIDES = [
  { src: './assets/apply-screen.png', alt: 'Bulk IPO apply screen' },
  { src: './assets/market-summary-screen.png', alt: 'Market summary screen' },
  { src: './assets/live-market-screen.png', alt: 'Live market screen' },
  { src: './assets/market-movers-screen.png', alt: 'Market movers screen' },
  { src: './assets/top-gainers-screen.png', alt: 'Top gainers screen' },
  { src: './assets/charts-screen.png', alt: 'Charts screen' },
  { src: './assets/services-screen.png', alt: 'Services hub screen' },
  { src: './assets/upcoming-issues-screen.png', alt: 'Upcoming issues screen' },
  { src: './assets/ipo-stats-screen.png', alt: 'IPO statistics screen' },
  { src: './assets/stock-screen.png', alt: 'Stock details screen' },
  { src: './assets/hydropower-screen.png', alt: 'Hydropower leaders screen' },
  { src: './assets/broker-buy-sell-screen.png', alt: 'Broker buy sell screen' },
  { src: './assets/broker-screen.png', alt: 'Broker accumulation screen' },
  { src: './assets/gold-silver-screen.png', alt: 'Gold and silver prices screen' },
  { src: './assets/accounts-screen.png', alt: 'Accounts manager screen' },
];

const AUTO_MS = 3200;
const RESUME_MS = 5000;

function initPhoneSwipe(root) {
  const front = root.querySelector('[data-phone-img="front"]');
  const mid = root.querySelector('[data-phone-img="mid"]');
  const back = root.querySelector('[data-phone-img="back"]');
  const prevBtn = root.querySelector('[data-swipe-prev]');
  const nextBtn = root.querySelector('[data-swipe-next]');
  const label = root.querySelector('[data-swipe-label]');
  const dotsWrap = root.querySelector('[data-swipe-dots]');
  if (!front || !dotsWrap || SCREEN_SLIDES.length === 0) return;

  let index = 0;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let dragging = false;
  let locked = null;
  let pointerId = null;
  let timer = null;
  let resumeTimer = null;
  let inView = true;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  SCREEN_SLIDES.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Go to screen ${i + 1}`);
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(i, true);
    });
    dotsWrap.appendChild(dot);
  });

  const dots = Array.from(dotsWrap.querySelectorAll('.carousel-dot'));

  function slideAt(i) {
    const n = SCREEN_SLIDES.length;
    return SCREEN_SLIDES[((i % n) + n) % n];
  }

  function applyImg(el, slide) {
    if (!el || !slide) return;
    el.src = slide.src;
    el.alt = slide.alt;
  }

  function render() {
    const current = slideAt(index);
    applyImg(front, current);
    applyImg(mid, slideAt(index + 1));
    applyImg(back, slideAt(index + 2));
    if (label) label.textContent = `${index + 1} / ${SCREEN_SLIDES.length}`;
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
    });
  }

  function stopAuto() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startAuto() {
    stopAuto();
    if (reducedMotion || !inView || document.hidden) return;
    timer = setInterval(() => {
      goTo(index + 1, false);
    }, AUTO_MS);
  }

  function pauseThenResume() {
    stopAuto();
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(startAuto, RESUME_MS);
  }

  function goTo(next, fromUser) {
    index = ((next % SCREEN_SLIDES.length) + SCREEN_SLIDES.length) % SCREEN_SLIDES.length;
    root.classList.add('is-swiping');
    render();
    window.setTimeout(() => root.classList.remove('is-swiping'), 280);
    if (fromUser) pauseThenResume();
  }

  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    goTo(index - 1, true);
  });
  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    goTo(index + 1, true);
  });

  function onPointerDown(e) {
    if (e.target.closest('button')) return;
    dragging = true;
    locked = null;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    root.classList.add('is-dragging');
    stopAuto();
    try {
      root.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  function onPointerMove(e) {
    if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    currentX = e.clientX;
    const dx = currentX - startX;
    const dy = e.clientY - startY;

    if (!locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (locked === 'x') root.classList.add('is-swiping');
    }

    if (locked === 'x') {
      e.preventDefault();
    }
  }

  function onPointerUp(e) {
    if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    dragging = false;
    root.classList.remove('is-dragging', 'is-swiping');
    try {
      root.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }

    const dx = currentX - startX;
    if (locked === 'x' && Math.abs(dx) > 40) {
      goTo(dx < 0 ? index + 1 : index - 1, true);
    } else {
      pauseThenResume();
    }
    locked = null;
    pointerId = null;
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove, { passive: false });
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAuto();
    else startAuto();
  });

  const viewObserver = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView) startAuto();
      else stopAuto();
    },
    { threshold: 0.25 },
  );
  viewObserver.observe(root);

  render();
  startAuto();
}

document.querySelectorAll('[data-phone-swipe]').forEach(initPhoneSwipe);
