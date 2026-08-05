(function() {
  'use strict';

  // ============================================================
  // 1. TYPING EFFECT
  // ============================================================
  const phrases = [
    "IPO Tools & Smart Market Tracking",
    "Market Intelligence & Data Visualization",
    "Nepal's Smartest Share Market Trading Platform",
    "Premium Insights in Real-Time"
  ];
  
  const subTexts = [
    "A complete solution to apply, track, and analyze IPOs along with real-time market movements.",
    "Advanced charts and visual tools that help you understand market trends quickly and clearly.",
    "A modern, user-friendly system designed for faster, smarter, and more efficient trading.",
    "Unlock deeper insights with premium screeners and 3D visualizations."
  ];

  let pIdx = 0;
  let cIdx = 0;
  let deleting = false;
  const typingEl = document.getElementById('typingText');
  const subEl = document.getElementById('subText');

  function typeEffect() {
    if (!typingEl) return;
    
    const cur = phrases[pIdx];
    let display;
    
    if (deleting) {
      display = cur.substring(0, cIdx - 1);
      cIdx--;
    } else {
      display = cur.substring(0, cIdx + 1);
      cIdx++;
    }
    
    typingEl.textContent = display;
    
    if (subEl) {
      subEl.textContent = subTexts[pIdx];
    }
    
    let speed = deleting ? 40 : 80;
    
    if (!deleting && cIdx === cur.length) {
      speed = 2000;
      deleting = true;
    } else if (deleting && cIdx === 0) {
      deleting = false;
      pIdx = (pIdx + 1) % phrases.length;
      speed = 400;
    }
    
    setTimeout(typeEffect, speed);
  }

  // Start typing after a small delay
  setTimeout(typeEffect, 600);

  // ============================================================
  // 2. HERO 3D SLIDER - 6 IMAGES (PNG)
  // ============================================================
  // Hero slider images - main1.png to main6.png
  const slides3D = [
    { src: "image/about1.jpg", alt: "Market Dashboard" },
    { src: "image/about 2.jpg", alt: "IPO Apply Screen" },
    { src: "image/about3.jpg", alt: "Premium Features" },
    { src: "image/about4.jpg", alt: "Account Management" },
    { src: "image/about6.jpg", alt: "Charts & Analytics" },
    { src: "image/baout9.jpg", alt: "Portfolio Overview" }
  ];

  // FALLBACK: SVG placeholders for hero slider (6 slides)
  const fallbackSlides3D = [
    { 
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23131722'/%3E%3Crect x='30' y='40' width='340' height='60' rx='12' fill='%232a7de1'/%3E%3Crect x='30' y='120' width='340' height='200' rx='16' fill='%231a2a3a'/%3E%3Ccircle cx='100' cy='220' r='40' fill='%232a7de1'/%3E%3Crect x='160' y='190' width='180' height='20' rx='6' fill='%23a0c4ff'/%3E%3Crect x='160' y='220' width='140' height='14' rx='6' fill='%236f7d98'/%3E%3Crect x='160' y='250' width='100' height='14' rx='6' fill='%236f7d98'/%3E%3Crect x='30' y='340' width='340' height='120' rx='16' fill='%231a2a3a'/%3E%3Crect x='50' y='360' width='120' height='20' rx='6' fill='%232a7de1'/%3E%3Crect x='50' y='390' width='200' height='14' rx='6' fill='%23a0c4ff'/%3E%3Crect x='50' y='415' width='160' height='14' rx='6' fill='%236f7d98'/%3E%3C/svg%3E", 
      alt: "Market" 
    },
    { 
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23131722'/%3E%3Crect x='30' y='40' width='340' height='60' rx='12' fill='%232a7de1'/%3E%3Crect x='30' y='120' width='340' height='200' rx='16' fill='%231a2a3a'/%3E%3Ctext x='50' y='180' font-family='Arial' font-size='28' fill='%23a0c4ff' font-weight='bold'%3EIPO Apply%3C/text%3E%3Crect x='50' y='210' width='280' height='40' rx='10' fill='%232a7de1'/%3E%3Crect x='50' y='270' width='280' height='40' rx='10' fill='%231a4f8b'/%3E%3C/svg%3E", 
      alt: "IPO" 
    },
    { 
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23131722'/%3E%3Crect x='30' y='40' width='340' height='60' rx='12' fill='%232a7de1'/%3E%3Crect x='30' y='120' width='340' height='200' rx='16' fill='%231a2a3a'/%3E%3Ctext x='50' y='180' font-family='Arial' font-size='28' fill='%23f0c040' font-weight='bold'%3EPREMIUM%3C/text%3E%3Crect x='50' y='220' width='280' height='20' rx='6' fill='%23a0c4ff'/%3E%3Crect x='50' y='255' width='200' height='20' rx='6' fill='%236f7d98'/%3E%3C/svg%3E", 
      alt: "Premium" 
    },
    { 
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23131722'/%3E%3Crect x='30' y='40' width='340' height='60' rx='12' fill='%232a7de1'/%3E%3Ccircle cx='200' cy='220' r='60' fill='%232a7de1'/%3E%3Crect x='80' y='310' width='240' height='30' rx='10' fill='%23a0c4ff'/%3E%3Crect x='100' y='360' width='200' height='16' rx='6' fill='%236f7d98'/%3E%3C/svg%3E", 
      alt: "Accounts" 
    },
    { 
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23131722'/%3E%3Crect x='30' y='40' width='340' height='60' rx='12' fill='%232a7de1'/%3E%3Crect x='30' y='120' width='340' height='200' rx='16' fill='%231a2a3a'/%3E%3Ctext x='50' y='180' font-family='Arial' font-size='28' fill='%232a7de1' font-weight='bold'%3ECharts%3C/text%3E%3Crect x='50' y='220' width='280' height='80' rx='10' fill='%231a2a3a'/%3E%3Crect x='70' y='240' width='40' height='60' rx='4' fill='%232a7de1'/%3E%3Crect x='130' y='220' width='40' height='80' rx='4' fill='%234a7dbf'/%3E%3Crect x='190' y='250' width='40' height='50' rx='4' fill='%237ab0ff'/%3E%3C/svg%3E", 
      alt: "Charts" 
    },
    { 
      src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800'%3E%3Crect width='400' height='800' fill='%23131722'/%3E%3Crect x='30' y='40' width='340' height='60' rx='12' fill='%232a7de1'/%3E%3Crect x='30' y='120' width='340' height='200' rx='16' fill='%231a2a3a'/%3E%3Ctext x='50' y='180' font-family='Arial' font-size='28' fill='%23a0c4ff' font-weight='bold'%3EPortfolio%3C/text%3E%3Crect x='50' y='220' width='280' height='30' rx='8' fill='%232a7de1'/%3E%3Crect x='50' y='270' width='280' height='30' rx='8' fill='%231a4f8b'/%3E%3Crect x='50' y='320' width='180' height='30' rx='8' fill='%236f7d98'/%3E%3C/svg%3E", 
      alt: "Portfolio" 
    }
  ];

  let current3D = 0;
  let total3D = slides3D.length;
  const container3D = document.getElementById('slider3D');
  const dots3D = document.getElementById('sliderDots3D');
  const prev3D = document.getElementById('sliderPrev3D');
  const next3D = document.getElementById('sliderNext3D');
  let autoInterval3D = null;
  let imagesLoaded = 0;

  // Check if images exist, if not use fallback
  function checkImagesAndRender() {
    let imageErrors = 0;
    const totalImages = slides3D.length;
    
    // If no images at all, use fallback immediately
    if (totalImages === 0) {
      slides3D.push.apply(slides3D, fallbackSlides3D);
      total3D = slides3D.length;
      render3D();
      return;
    }
    
    slides3D.forEach(function(slide, index) {
      const img = new Image();
      img.onload = function() {
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
          render3D();
        }
      };
      img.onerror = function() {
        imageErrors++;
        // If all images fail, use fallback
        if (imageErrors === totalImages) {
          console.warn('Hero 3D images not found. Using SVG fallback.');
          // Replace slides with fallback
          slides3D.length = 0;
          fallbackSlides3D.forEach(function(s) {
            slides3D.push(s);
          });
          total3D = slides3D.length;
          render3D();
        } else if (imagesLoaded + imageErrors === totalImages) {
          // Some images loaded, some failed - render with what we have
          render3D();
        }
      };
      img.src = slide.src;
    });
    
    // If images load too slowly, render after 3 seconds anyway
    setTimeout(function() {
      if (imagesLoaded < totalImages && slides3D.length > 0) {
        render3D();
      }
    }, 3000);
  }

  function render3D() {
    if (!container3D) return;
    
    container3D.innerHTML = '';
    slides3D.forEach(function(s, i) {
      const div = document.createElement('div');
      div.className = 'hero-shot';
      const img = document.createElement('img');
      img.src = s.src;
      img.alt = s.alt;
      img.loading = 'lazy';
      // Add error handling for individual images
      img.onerror = function() {
        // If individual image fails, use a colored placeholder
        this.style.display = 'none';
        const parent = this.parentElement;
        parent.style.display = 'flex';
        parent.style.alignItems = 'center';
        parent.style.justifyContent = 'center';
        parent.style.background = '#1a2a3a';
        parent.style.border = '2px solid #2a7de1';
        const span = document.createElement('span');
        span.textContent = s.alt || 'Slide ' + (i + 1);
        span.style.color = '#a0c4ff';
        span.style.fontSize = '16px';
        span.style.fontWeight = 'bold';
        span.style.textAlign = 'center';
        span.style.padding = '10px';
        parent.appendChild(span);
      };
      div.appendChild(img);
      div.dataset.index = i;
      container3D.appendChild(div);
    });
    update3D();
  }

  function update3D() {
    if (!container3D) return;
    
    const items = container3D.querySelectorAll('.hero-shot');
    items.forEach(function(el, i) {
      el.className = 'hero-shot';
      let diff = i - current3D;
      
      if (diff > total3D / 2) diff -= total3D;
      if (diff < -total3D / 2) diff += total3D;
      
      if (diff === 0) {
        el.classList.add('slide-center');
      } else if (diff === 1 || diff === 1 - total3D) {
        el.classList.add('slide-right');
      } else if (diff === -1 || diff === total3D - 1) {
        el.classList.add('slide-left');
      } else if (diff === 2 || diff === 2 - total3D) {
        el.classList.add('slide-far-right');
      } else if (diff === -2 || diff === total3D - 2) {
        el.classList.add('slide-far-left');
      } else {
        el.classList.add('slide-hidden');
      }
    });
    
    if (dots3D) {
      const dotSpans = dots3D.querySelectorAll('span');
      dotSpans.forEach(function(d, i) {
        d.classList.toggle('active', i === current3D);
      });
    }
  }

  function go3D(idx) {
    current3D = (idx + total3D) % total3D;
    update3D();
    resetAuto3D();
  }

  function next3DF() {
    go3D(current3D + 1);
  }

  function prev3DF() {
    go3D(current3D - 1);
  }

  function initDots3D() {
    if (!dots3D) return;
    
    dots3D.innerHTML = '';
    for (let i = 0; i < total3D; i++) {
      const d = document.createElement('span');
      d.addEventListener('click', function() {
        go3D(i);
      });
      dots3D.appendChild(d);
    }
  }

  function startAuto3D() {
    if (autoInterval3D) {
      clearInterval(autoInterval3D);
    }
    autoInterval3D = setInterval(next3DF, 4000);
  }

  function resetAuto3D() {
    if (autoInterval3D) {
      clearInterval(autoInterval3D);
      startAuto3D();
    }
  }

  // Initialize 3D slider - check images first
  checkImagesAndRender();
  initDots3D();
  startAuto3D();

  if (prev3D) {
    prev3D.addEventListener('click', prev3DF);
  }
  if (next3D) {
    next3D.addEventListener('click', next3DF);
  }
  if (container3D) {
    container3D.addEventListener('mouseenter', function() {
      if (autoInterval3D) {
        clearInterval(autoInterval3D);
      }
    });
    container3D.addEventListener('mouseleave', startAuto3D);
  }

  // ============================================================
  // 3. 20-IMAGE PHONE SLIDER - FULL PATHS (PNG)
  // ============================================================
  // Phone slider images - about1.png to about20.png (fully defined)
  const phoneSlides = [
    { src: "image/about1.jpg", alt: "App Screen 1" },
    { src: "image/about 2.jpg", alt: "App Screen 2" },
    { src: "image/about3.jpg", alt: "App Screen 3" },
    { src: "image/about4.jpg", alt: "App Screen 4" },
    { src: "image/about5.jpg", alt: "App Screen 5" },
    { src: "image/about6.jpg", alt: "App Screen 6" },
    { src: "image/about7.jpg", alt: "App Screen 7" },
    { src: "image/about8.jpg", alt: "App Screen 8" },
    { src: "image/baout9.jpg", alt: "App Screen 9" },
    { src: "image/about10.jpg", alt: "App Screen 10" },
    { src: "image/about11.jpg", alt: "App Screen 11" },
    { src: "image/about12.jpg", alt: "App Screen 12" },
    { src: "image/main image 4.jpeg", alt: "App Screen 13" },
    { src: "image/about14.jpg", alt: "App Screen 14" },
    { src: "image/main image 5.jpeg", alt: "App Screen 15" },
    { src: "image/about16.jpg", alt: "App Screen 16" },
    { src: "image/about17.jpg", alt: "App Screen 17" },
    { src: "image/about18.jpg", alt: "App Screen 18" },
    { src: "image/about19.jpeg", alt: "App Screen 19" },
    { src: "image/about20.jpeg", alt: "App Screen 20" }
  ];

  // SVG Fallback for phone slider (20 slides)
  const phoneFallbackColors = [
    '#2a7de1', '#1a4f8b', '#a0c4ff', '#f0c040', '#6f7d98',
    '#d4a017', '#c0c0c0', '#4a7dbf', '#7ab0ff', '#e67e22',
    '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c', '#f39c12',
    '#3498db', '#e67e22', '#2c3e50', '#16a085', '#c0392b'
  ];

  function getPhoneFallbackSVG(index) {
    const c1 = phoneFallbackColors[index % phoneFallbackColors.length];
    const c2 = phoneFallbackColors[(index + 3) % phoneFallbackColors.length];
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 600">' +
      '<rect width="300" height="600" fill="#131722"/>' +
      '<rect x="20" y="30" width="260" height="50" rx="12" fill="' + c1 + '"/>' +
      '<rect x="20" y="100" width="260" height="160" rx="16" fill="#1a2a3a"/>' +
      '<circle cx="80" cy="180" r="30" fill="' + c2 + '"/>' +
      '<rect x="130" y="155" width="130" height="16" rx="6" fill="#a0c4ff"/>' +
      '<rect x="130" y="185" width="100" height="12" rx="6" fill="#6f7d98"/>' +
      '<text x="40" y="310" font-family="Arial" font-size="18" fill="#a0c4ff">Screen ' + (index + 1) + '</text>' +
      '<rect x="30" y="340" width="240" height="30" rx="8" fill="' + c1 + '"/>' +
      '<rect x="30" y="390" width="240" height="30" rx="8" fill="' + c2 + '"/>' +
      '<rect x="30" y="440" width="200" height="30" rx="8" fill="#6f7d98"/>' +
      '</svg>'
    );
  }

  let currentPhone = 0;
  const totalPhoneSlides = phoneSlides.length;
  const wrapper = document.getElementById('sliderWrapper');
  const label = document.getElementById('sliderLabel');
  const dots = document.getElementById('sliderDots');
  const prevBtn = document.getElementById('sliderPrev');
  const nextBtn = document.getElementById('sliderNext');
  let phoneAuto = null;
  let phoneImagesLoaded = 0;
  let phoneImageErrors = 0;

  function checkPhoneImagesAndRender() {
    const total = phoneSlides.length;
    
    // If no images, use fallback immediately
    if (total === 0) {
      for (let i = 0; i < 20; i++) {
        phoneSlides.push({
          src: getPhoneFallbackSVG(i),
          alt: 'Screen ' + (i + 1)
        });
      }
      renderPhone();
      return;
    }
    
    phoneSlides.forEach(function(slide, index) {
      const img = new Image();
      img.onload = function() {
        phoneImagesLoaded++;
        if (phoneImagesLoaded + phoneImageErrors === total) {
          renderPhone();
        }
      };
      img.onerror = function() {
        phoneImageErrors++;
        // Use SVG fallback for failed images
        phoneSlides[index].src = getPhoneFallbackSVG(index);
        if (phoneImagesLoaded + phoneImageErrors === total) {
          renderPhone();
        }
      };
      img.src = slide.src;
    });
    
    // Render after 3 seconds even if images haven't loaded
    setTimeout(function() {
      if (phoneImagesLoaded < total) {
        renderPhone();
      }
    }, 3000);
  }

  function renderPhone() {
    if (!wrapper) return;
    
    wrapper.innerHTML = '';
    phoneSlides.forEach(function(s, i) {
      const div = document.createElement('div');
      div.className = 'phone-slide';
      const img = document.createElement('img');
      img.src = s.src;
      img.alt = s.alt;
      img.loading = 'lazy';
      img.onerror = function() {
        // If individual image fails, use SVG fallback
        this.src = getPhoneFallbackSVG(i);
      };
      div.appendChild(img);
      wrapper.appendChild(div);
    });
    updatePhone();
  }

  function updatePhone() {
    if (!wrapper) return;
    
    const items = wrapper.querySelectorAll('.phone-slide');
    items.forEach(function(el, i) {
      el.className = 'phone-slide';
      let diff = i - currentPhone;
      
      if (diff > totalPhoneSlides / 2) diff -= totalPhoneSlides;
      if (diff < -totalPhoneSlides / 2) diff += totalPhoneSlides;
      
      if (diff === 0) {
        el.classList.add('active');
      } else if (diff === 1 || diff === 1 - totalPhoneSlides) {
        el.classList.add('right');
      } else if (diff === -1 || diff === totalPhoneSlides - 1) {
        el.classList.add('left');
      } else if (diff === 2 || diff === 2 - totalPhoneSlides) {
        el.classList.add('far-right');
      } else if (diff === -2 || diff === totalPhoneSlides - 2) {
        el.classList.add('far-left');
      } else {
        el.classList.add('hidden-slide');
      }
    });
    
    if (label) {
      label.textContent = (currentPhone + 1) + ' / ' + totalPhoneSlides;
    }
    
    if (dots) {
      const dotSpans = dots.querySelectorAll('span');
      dotSpans.forEach(function(d, i) {
        d.classList.toggle('active', i === currentPhone);
      });
    }
  }

  function goPhone(idx) {
    currentPhone = (idx + totalPhoneSlides) % totalPhoneSlides;
    updatePhone();
  }

  function initDotsPhone() {
    if (!dots) return;
    
    dots.innerHTML = '';
    for (let i = 0; i < totalPhoneSlides; i++) {
      const d = document.createElement('span');
      d.addEventListener('click', function() {
        goPhone(i);
      });
      dots.appendChild(d);
    }
  }

  function startPhoneAuto() {
    if (phoneAuto) {
      clearInterval(phoneAuto);
    }
    phoneAuto = setInterval(function() {
      goPhone(currentPhone + 1);
    }, 3500);
  }

  // Initialize phone slider
  checkPhoneImagesAndRender();
  initDotsPhone();
  startPhoneAuto();

  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      goPhone(currentPhone - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      goPhone(currentPhone + 1);
    });
  }

  if (wrapper) {
    wrapper.addEventListener('mouseenter', function() {
      if (phoneAuto) {
        clearInterval(phoneAuto);
      }
    });
    wrapper.addEventListener('mouseleave', startPhoneAuto);
  }

  // ============================================================
  // 4. LOGO IMAGE - Update all logo references
  // ============================================================
  function updateLogoImages() {
    const logoImages = document.querySelectorAll('.brand-mark img, .footer-logo img, .rotate-3d-image img');
    logoImages.forEach(function(img) {
      // Only update if the src contains SVG data (default placeholder)
      if (img.src && img.src.indexOf('data:image/svg+xml') !== -1) {
        img.src = 'image/logo.png';
      }
    });
  }

  // Call after page load
  if (document.readyState === 'complete') {
    updateLogoImages();
  } else {
    window.addEventListener('load', updateLogoImages);
  }

  // ============================================================
  // 5. 3D TILT EFFECT
  // ============================================================
  // Soft tilt on cards only — skip anchors so links stay clickable
  document.querySelectorAll('.tilt-3d').forEach(function(el) {
    if (el.tagName === 'A' || el.querySelector('a, button, input, textarea')) {
      return;
    }
    el.addEventListener('mousemove', function(e) {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform =
        'perspective(1000px) rotateX(' +
        y * -6 +
        'deg) rotateY(' +
        x * 6 +
        'deg)';
    });
    el.addEventListener('mouseleave', function() {
      el.style.transform = '';
    });
  });

  // ============================================================
  // 6. REVEAL ON SCROLL
  // ============================================================
  const reveals = document.querySelectorAll('.reveal');
  
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
        }
      });
    }, { 
      threshold: 0.1 
    });
    
    reveals.forEach(function(el) {
      obs.observe(el);
    });
  } else {
    // Fallback for older browsers
    reveals.forEach(function(el) {
      el.classList.add('visible');
    });
  }

  // ============================================================
  // 7. THEME TOGGLE
  // ============================================================
  const toggle = document.getElementById('themeToggle');
  const labelTheme = document.getElementById('themeLabel');
  const icon = document.getElementById('themeIcon');

  function setTheme(light) {
    if (light) {
      document.body.classList.add('light');
      if (labelTheme) labelTheme.textContent = 'Light';
      if (icon) {
        icon.className = 'fas fa-sun';
      }
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light');
      if (labelTheme) labelTheme.textContent = 'Dark';
      if (icon) {
        icon.className = 'fas fa-moon';
      }
      localStorage.setItem('theme', 'dark');
    }
  }

  // Check saved theme
  if (localStorage.getItem('theme') === 'light') {
    setTheme(true);
  } else {
    setTheme(false);
  }

  if (toggle) {
    toggle.addEventListener('click', function() {
      setTheme(!document.body.classList.contains('light'));
    });
  }

  // ============================================================
  // 8. SMOOTH SCROLL FOR ANCHOR LINKS
  // ============================================================
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const targetElement = document.querySelector(targetId);
      if (!targetElement) return;

      e.preventDefault();
      const header = document.querySelector('.site-header');
      const offset = header ? header.offsetHeight + 8 : 0;
      const top =
        targetElement.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
      history.pushState(null, '', targetId);
    });
  });

  // ============================================================
  // 9. CONSOLE LOG
  // ============================================================
  console.log('NEPSE GHAR - Script loaded successfully!');
  console.log('Hero 3D images: main1.png to main6.png (6 images)');
  console.log('Phone slider images: about1.png to about20.png (20 PNG images)');
  console.log('Logo image: image/logo.png');
  
  // Handle any uncaught errors
  window.addEventListener('error', function(e) {
    console.warn('Script error caught:', e.message);
  });

})();