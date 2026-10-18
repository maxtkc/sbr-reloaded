// Samuel Butler joins the committee as the last card. His email link opens an in-page rickroll.
import { pause, resume } from '../bus';
import { found } from '../eggs';

const EMAIL = 'sb1835@cam.ac.uk';
const BIO = "Wrote Erewhon. Left St John's in 1858 and has not been to an event since.";
const VIDEO = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1';

const CSS = `
.rr{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:1rem;background:rgba(0,0,0,.8)}
.rr-box{position:relative;width:min(56rem,100%);aspect-ratio:16/9;background:#000;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.rr-box iframe{display:block;width:100%;height:100%;border:0}
.rr-x{position:absolute;top:-1rem;right:-1rem;width:2.5rem;height:2.5rem;border:0;border-radius:50%;
background:rgba(255,255,255,.95);color:#000;font:700 1.4rem/1 sans-serif;cursor:pointer}
@media (max-width:40rem){.rr-x{top:-3rem;right:0}}
`;

export default function butler(): (() => void) | void {
  const list = document.querySelector<HTMLElement>('#committee .members');
  const template = document.querySelector<HTMLTemplateElement>('#butler-card');
  if (!list || !template) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  // Card from the committee's Butler template, with the portrait and card styles.
  const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  card.querySelector('h3')!.textContent = 'Samuel Butler';
  card.querySelector('.role')!.textContent = 'Antisocial';
  const mail = card.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!;
  mail.href = `mailto:${EMAIL}`;
  mail.textContent = EMAIL;
  mail.dataset.rickroll = '';
  const bio = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'About';
  const p = document.createElement('p');
  p.textContent = BIO;
  bio.append(summary, p);
  card.append(bio);
  list.append(card);

  let modal: HTMLElement | null = null;
  let opener: HTMLElement | null = null;

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null;
    removeEventListener('keydown', onKey);
    opener?.focus({ preventScroll: true });
    resume();
  }

  function open() {
    if (modal) return;
    found('butler');
    modal = document.createElement('div');
    modal.className = 'rr';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Email Samuel Butler');
    const box = document.createElement('div');
    box.className = 'rr-box';
    const iframe = document.createElement('iframe');
    iframe.src = VIDEO;
    iframe.title = 'Samuel Butler';
    iframe.allow = 'autoplay; encrypted-media';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'rr-x';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    x.addEventListener('click', close);
    box.append(iframe, x);
    modal.append(box);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.body.append(modal);
    addEventListener('keydown', onKey);
    x.focus();
    pause();
  }

  mail.addEventListener('click', (e) => {
    e.preventDefault();
    opener = mail;
    open();
  });

  return () => {
    close();
    card.remove();
    style.remove();
  };
}
