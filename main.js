import { animate, createTimeline, createScope, onScroll, splitText, stagger } from './assets/vendor/animejs-4.2.2/anime.esm.min.js';

const clamp = value => Math.max(0, Math.min(1, value));
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const content = document.querySelector('.site-main');
const contact = document.querySelector('#contact');
const narrative = document.querySelector('.network-story');
const canvas = document.querySelector('#engine-canvas');
const steps = [...document.querySelectorAll('.network-steps li')];
const title = document.querySelector('.network-title');
const count = document.querySelector('.network-count');
const labels = ['Token stream', 'Attention', 'Feature mixing', 'Output'];
const accents = ['#ef8974', '#92c6ad', '#82b9d7', '#b69bd6'];
const thresholds = [0, .25, .5, .78, 1];
const rows = [...document.querySelectorAll('.project-row')];
const progressBar = document.querySelector('.page-progress span');
const toggle = document.querySelector('.motion-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
const finite = new Set();
let reducedMotion = preference.matches;
let paused = false;
let engine;
let observer;
let entranceScope;
let scheduled = false;
let displayedProgress = 0;
let selectedChapter = -1;
let titleSplit;
let titleAnimation;
root.classList.add('has-choreography');
narrative.dataset.scrollEngine = 'animejs-onScroll';

mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { mobileMenu.open = false; }));
document.addEventListener('keydown', event => { if (event.key === 'Escape') mobileMenu.open = false; });
document.addEventListener('click', event => { if (!mobileMenu.contains(event.target)) mobileMenu.open = false; });

function track(animation) {
  finite.add(animation);
  animation.then(() => finite.delete(animation));
  return animation;
}

function setupEntrances() {
  entranceScope?.revert();
  entranceScope = null;
  if (reducedMotion) return;
  entranceScope = createScope({ root: document.body }).add(() => {
    track(createTimeline({ defaults: { ease: 'outExpo' } })
      .label('portrait', 0)
      .add('.hero-photo', { opacity: [0, 1], y: [18, 0], rotate: [-5, 0], duration: 850 }, 'portrait')
      .label('name', 120)
      .add('.hero-content h1', { opacity: [0, 1], y: [35, 0], duration: 1100 }, 'name')
      .add('.hero-eyebrow, .hero-sub, .hero-desc, .cta-row', { opacity: [0, 1], y: [18, 0], duration: 800, delay: stagger(85) }, 'name+=180'));
    document.querySelectorAll('.section-head, .project-row, .contact-cell').forEach(el => {
      const reveal = animate(el, {
        opacity: [.35, 1], y: [28, 0], duration: 750, ease: 'outExpo', autoplay: false,
      });
      track(reveal);
      onScroll({
        target: el, enter: '90% top', repeat: false,
        onEnter: () => paused || reducedMotion ? reveal.complete() : reveal.play(),
      });
    });
  });
}

function changeChapter(selected) {
  if (selected === selectedChapter) return;
  const first = selectedChapter < 0;
  selectedChapter = selected;
  titleAnimation?.revert();
  titleSplit?.revert();
  title.textContent = labels[selected];
  count.textContent = String(selected + 1).padStart(2, '0');
  narrative.style.setProperty('--chapter-accent', accents[selected]);
  if (reducedMotion || paused || first) return;
  titleSplit = splitText(title, { chars: true, words: false, accessible: true });
  titleAnimation = track(animate(titleSplit.chars, {
    y: [8, 0], opacity: [0, 1],
    duration: 320, delay: stagger(8), ease: 'outExpo',
  }));
}

function displayProgress(progress) {
  progress = clamp(progress);
  displayedProgress = progress;
  const selected = progress >= .78 ? 3 : progress >= .5 ? 2 : progress >= .25 ? 1 : 0;
  canvas.dataset.phase = progress.toFixed(4);
  narrative.dataset.step = String(selected + 1);
  changeChapter(selected);
  steps.forEach((step, i) => {
    step.classList.toggle('is-current', i === selected);
    step.classList.toggle('is-revealed', i <= selected);
  });
  engine?.setState({ progress, project: 0 });
}

// The installed skill's named timeline and CSS-variable animation patterns keep
// labels, rails and the Three.js scene on one clock. onScroll owns synchronization.
const scrub = { progress: 0 };
const story = createTimeline({
  autoplay: false,
  defaults: { ease: 'linear' },
  onUpdate: () => { if (!paused) displayProgress(scrub.progress); },
}).add(scrub, { progress: [0, 1], duration: 10000 }, 0);
['tokens', 'attention', 'features', 'output'].forEach((name, i) => {
  story.label(name, thresholds[i] * 10000)
    .add(steps[i], { '--step-progress': [0, 1], duration: (thresholds[i + 1] - thresholds[i]) * 10000 }, name);
});

function connectScroll() {
  observer?.revert();
  observer = null;
  if (reducedMotion) {
    story.seek(story.duration);
    displayProgress(1);
    return;
  }
  if (paused) return;
  observer = onScroll({
    target: content,
    enter: 'top top',
    // Finish alongside the last projects. No animation-only space is added.
    leave: () => ({ target: Math.max(1, contact.offsetTop - innerHeight), container: 0 }),
    sync: .65,
    repeat: true,
    onUpdate: self => {
      narrative.dataset.scrollTarget = self.progress.toFixed(4);
    },
  }).link(story);
}

function updateViewport() {
  progressBar.style.transform = 'scaleX(' + clamp(scrollY / Math.max(1, root.scrollHeight - innerHeight)) + ')';
  engine?.setPaused(paused || reducedMotion);
  const center = innerHeight / 2;
  let closest = rows[0];
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    const c = closest.getBoundingClientRect();
    if (Math.abs(r.top + r.height / 2 - center) < Math.abs(c.top + c.height / 2 - center)) closest = row;
  }
  rows.forEach(row => row.classList.toggle('active', row === closest));
}

function resize() {
  engine?.resize();
  if (observer?.target) observer.refresh();
  updateViewport();
}
addEventListener('scroll', () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; updateViewport(); });
}, { passive: true });
addEventListener('resize', resize);
document.fonts.ready.then(resize);

function setPaused(value) {
  paused = value;
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.querySelector('.motion-label').textContent = paused ? 'Resume motion' : 'Pause motion';
  toggle.querySelector('span').textContent = paused ? '▷' : 'Ⅱ';
  toggle.title = paused ? 'Resume the scroll-driven network reveal' : 'Pause the scroll-driven network reveal';
  if (paused) {
    observer?.revert();
    observer = null;
    story.pause();
    [...finite].forEach(animation => animation.complete());
  } else {
    connectScroll();
  }
  updateViewport();
}
toggle.addEventListener('click', () => setPaused(!paused));
preference.addEventListener('change', event => {
  reducedMotion = event.matches;
  engine?.setReducedMotion(reducedMotion);
  [...finite].forEach(animation => animation.complete());
  titleAnimation?.revert();
  titleSplit?.revert();
  titleAnimation = null;
  titleSplit = null;
  title.textContent = labels[selectedChapter < 0 ? 0 : selectedChapter];
  paused = false;
  setupEntrances();
  resize();
  setPaused(false);
});

addEventListener('pagehide', () => {
  observer?.revert();
  entranceScope?.revert();
});
addEventListener('pageshow', event => {
  if (event.persisted) { resize(); connectScroll(); }
});

resize();
displayProgress(reducedMotion ? 1 : 0);
setupEntrances();
connectScroll();
import('./choreography.js?v=11').then(({ initChoreography }) => {
  engine = initChoreography(canvas, { reducedMotion });
  engine.setState({ progress: displayedProgress, project: 0 });
  resize();
}).catch(error => console.warn('Using the static network fallback:', error));
