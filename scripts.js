(function(){
  // Business ID multi-salon support
  const DEFAULT_BID = "0af9e368-f488-449b-8013-7f44361be462";
  const params = new URLSearchParams(location.search);
  const BID = params.get("business_id") || DEFAULT_BID;
  document.querySelectorAll('a[href*="__BID__"]').forEach(a => {
    a.href = a.href.replaceAll("__BID__", encodeURIComponent(BID));
  });

  // Sticky header shadow
  const hdr = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    hdr.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive:true });

  // Mobile menu
  const menuBtn = document.getElementById('menuBtn');
  const panel = document.getElementById('mobilePanel');
  if(menuBtn && panel){
    menuBtn.addEventListener('click', () => {
      const open = panel.classList.contains('is-open');
      panel.classList.toggle('is-open', !open);
      menuBtn.setAttribute('aria-expanded', String(!open));
    });
    panel.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        panel.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded','false');
      });
    });
  }

  // Contact form
  const form = document.getElementById('contactForm');
  if(form){
    form.addEventListener('submit', e => {
      e.preventDefault();
      alert('Thank you! We received your message and will be in touch shortly.');
      form.reset();
    });
  }

  // Floating book button
  const bf = document.getElementById('bookFloat');
  if(bf){
    bf.addEventListener('click', () => window.open('https://salongenie.com/book/victoria-nails','_blank','noopener'));
    const isMobile = () => window.innerWidth < 621;
    const updateBF = () => bf.style.display = isMobile() ? 'none' : 'inline-flex';
    window.addEventListener('resize', updateBF, {passive:true});
    updateBF();
  }

  // Scroll reveal
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold:.12 });
  reveals.forEach(el => observer.observe(el));

  // Gift card chip interactivity
  document.querySelectorAll('.gift-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.gift-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const amountEl = document.querySelector('.gift-amount');
      if(amountEl) amountEl.textContent = chip.textContent;
    });
  });
})();
