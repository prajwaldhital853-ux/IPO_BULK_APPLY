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
