import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
// Same key is read by the inline script in index.html before first paint.
const KEY = 'theme';

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1220' : '#0f172a');
}

/** Theme preference for this device: follows the phone/computer setting unless overridden. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);

  useEffect(() => {
    apply(choice);
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch { /* storage unavailable */ }
    if (choice !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [choice]);

  const cycle = () => setChoice((c) => (c === 'system' ? 'dark' : c === 'dark' ? 'light' : 'system'));
  return { choice, cycle };
}
