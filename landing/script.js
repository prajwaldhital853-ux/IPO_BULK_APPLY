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
    threshold: 0.16,
    rootMargin: '0px 0px -40px 0px',
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

function initCarousel(root) {
  const track = root.querySelector('.carousel-track');
  const slides = Array.from(root.querySelectorAll('.carousel-slide'));
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');
  const label = root.querySelector('[data-carousel-label]');
  const dotsWrap = root.querySelector('[data-carousel-dots]');
  if (!track || slides.length === 0) return;

  let index = 0;
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
    dot.setAttribute('aria-label', `Go to screen ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
  });

  const dots = Array.from(dotsWrap.querySelectorAll('.carousel-dot'));

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    if (label) label.textContent = `${index + 1} / ${slides.length}`;
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
    });
  }

  function goTo(next) {
    index = (next + slides.length) % slides.length;
    render();
  }

  prevBtn?.addEventListener('click', () => goTo(index - 1));
  nextBtn?.addEventListener('click', () => goTo(index + 1));

  function onStart(clientX) {
    dragging = true;
    startX = clientX;
    currentX = clientX;
    root.classList.add('is-dragging');
    track.style.transition = 'none';
  }

  function onMove(clientX) {
    if (!dragging) return;
    currentX = clientX;
    const delta = currentX - startX;
    const percent = (delta / root.clientWidth) * 100;
    track.style.transform = `translateX(calc(-${index * 100}% + ${percent}%))`;
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    track.style.transition = '';
    const delta = currentX - startX;
    if (Math.abs(delta) > 50) {
      goTo(delta < 0 ? index + 1 : index - 1);
    } else {
      render();
    }
  }

  root.addEventListener(
    'touchstart',
    (e) => onStart(e.touches[0].clientX),
    { passive: true },
  );
  root.addEventListener(
    'touchmove',
    (e) => onMove(e.touches[0].clientX),
    { passive: true },
  );
  root.addEventListener('touchend', onEnd);
  root.addEventListener('touchcancel', onEnd);

  root.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onStart(e.clientX);
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    onMove(e.clientX);
  });
  window.addEventListener('mouseup', onEnd);

  render();
}

document.querySelectorAll('[data-carousel]').forEach(initCarousel);
