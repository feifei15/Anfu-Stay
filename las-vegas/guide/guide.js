// Copy and quicknav patterns adapted from sh/guide/index.html.
const status = document.querySelector('.copy-status');
document.querySelectorAll('[data-copy]').forEach(button => {
  const label = button.textContent;
  let timer;
  button.addEventListener('click', async () => {
    const credential = document.getElementById(button.dataset.copy);
    const text = credential.textContent;
    clearTimeout(timer);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(input);
        try {
          input.select();
          if (!document.execCommand('copy')) throw new Error('Copy unavailable');
        } finally {
          input.remove();
          button.focus({preventScroll:true});
        }
      }
      button.textContent = 'Copied ✓';
      status.textContent = button.dataset.copy === 'wifi-network' ? 'Wi-Fi network copied.' : 'Wi-Fi password copied.';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(credential);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Select and copy';
      status.textContent = 'Automatic copying is unavailable. The text is selected; use your device’s Copy command.';
    }
    timer = setTimeout(() => { button.textContent = label; }, 2000);
  });
});

const nav = document.querySelector('.quicknav-inner');
const links = [...nav.querySelectorAll('a')];
const sections = links.map(link => document.querySelector(link.getAttribute('href')));
let current;
function updateNavigation() {
  const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
  const active = atBottom ? sections.at(-1) : [...sections].reverse().find(section => section.getBoundingClientRect().top <= 100) || sections[0];
  if (active.id === current) return;
  current = active.id;
  links.forEach(link => {
    const selected = link.hash === `#${current}`;
    link.classList.toggle('active', selected);
    if (selected) {
      link.setAttribute('aria-current', 'location');
      nav.scrollTo({left:link.offsetLeft - nav.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2, behavior:'instant'});
    } else link.removeAttribute('aria-current');
  });
}
let scheduled = false;
window.addEventListener('scroll', () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { updateNavigation(); scheduled = false; });
}, {passive:true});
window.addEventListener('resize', updateNavigation);
window.addEventListener('hashchange', updateNavigation);
updateNavigation();
