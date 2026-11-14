'use client';
/** Replays the page entrance on request. Hidden by CSS when motion is reduced. */
export default function ReplayIntro() {
  function replay() {
    const el = document.querySelector<HTMLElement>('[data-mk-enter]');
    if (!el) return;
    el.classList.remove('mk-enter', 'mk-enter-home');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('mk-enter', 'mk-enter-home');
  }
  return <button type="button" onClick={replay} className="mk-text-link mk-replay">צפייה חוזרת בפתיחה</button>;
}
