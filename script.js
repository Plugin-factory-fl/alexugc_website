(() => {
'use strict';
const $ = (q, context = document) => context.querySelector(q);
const $$ = (q, context = document) => [...context.querySelectorAll(q)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = $$('.reveal');
setTimeout(() => reveals.forEach(el => el.classList.add('is-visible')),1500);
if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
  }, { rootMargin: '0px 0px -40px', threshold: .08 });
  reveals.forEach(el => observer.observe(el));
} else reveals.forEach(el => el.classList.add('is-visible'));
const menuButton = $('.menu-toggle');
const nav = $('#navlinks');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('open', !open);
});
$$('a', nav).forEach(a => a.addEventListener('click', () => { menuButton.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }));
const modal = $('.video-modal');
const modalVideo = $('#modal-video');
let previousFocus;
$$('.video-card').forEach(card => card.addEventListener('click', () => {
  previousFocus = document.activeElement;
  modalVideo.src = `assets/videos/${card.dataset.video}.mp4`;
  modalVideo.poster = `assets/images/${card.dataset.video}.jpg`;
  $('#modal-title').textContent = card.dataset.title;
  modal.showModal();
  modalVideo.play().catch(() => {});
}));
const closeModal = () => { modalVideo.pause(); modalVideo.removeAttribute('src'); modalVideo.load(); modal.close(); previousFocus?.focus(); };
$('.modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
modal.addEventListener('close', () => { modalVideo.pause(); });
modal.addEventListener('cancel', e=>{e.preventDefault();closeModal();});
const heroVideo = $('.stage-video video');
const heroToggle = $('#hero-toggle');
heroToggle.classList.toggle('is-paused',heroVideo.paused);
heroToggle.addEventListener('click',() => heroVideo.paused ? heroVideo.play().catch(()=>{}) : heroVideo.pause());
heroVideo.addEventListener('play',()=>{heroToggle.setAttribute('aria-label','Pause background video');heroToggle.innerHTML='Pause <span aria-hidden="true">Ⅱ</span>';});
heroVideo.addEventListener('pause',()=>{heroToggle.setAttribute('aria-label','Play background video');heroToggle.innerHTML='Play <span aria-hidden="true">▶</span>';});
if (reduceMotion) { heroVideo.removeAttribute('autoplay'); heroVideo.pause(); }
if ('IntersectionObserver' in window && !reduceMotion) {
  new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting ? heroVideo.play().catch(() => {}) : heroVideo.pause()), {threshold:.2}).observe(heroVideo);
}
const form = $('#brief-form');
const output = $('#brief-output');
const instagram = $('#instagram-brief');
const toast = $('#toast');
let toastTimer;
function showToast(message) { toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000); }
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  $('#prepared-brief').value = `Hi Alex! I'm interested in working with you.

Name: ${values.name}
Brand: ${values.brand}
Email: ${values.email}
Package: ${values.package}

Product and creative direction:
${values.details}${values.link ? `

Product or reference link:
${values.link}` : ''}`;
  output.hidden = false;
  instagram.hidden = false;
  form.querySelector('.form-submit').hidden = true;
  output.scrollIntoView({behavior: reduceMotion ? 'instant' : 'smooth', block: 'center'});
  showToast('Your brief is ready to copy and share.');
});
async function copyBrief() {
  const text = $('#prepared-brief').value;
  try { await navigator.clipboard.writeText(text); showToast('Project brief copied. Send it to @alex_ugc_pro on Instagram.'); }
  catch { $('#prepared-brief').select(); showToast('Your brief is selected. Copy it, then send it on Instagram.'); }
}
$('#copy-brief').addEventListener('click', copyBrief);
$('#year').textContent = new Date().getFullYear();
})();
