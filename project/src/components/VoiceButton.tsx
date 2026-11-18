import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

// Minimal typing for the browser Speech Recognition API (Chrome/Edge/Android).
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
}
type RecognizerCtor = new () => Recognizer;

const getCtor = (): RecognizerCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const LANGS = [{ code: 'en-IN', label: 'EN' }, { code: 'ta-IN', label: 'தமிழ்' }];
const LANG_KEY = 'voiceLang';

// Dictation button: each finished phrase is passed to onText. Hidden on
// browsers without speech recognition (e.g. Firefox, some iPhones).
export default function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) || 'en-IN'; } catch { return 'en-IN'; } });
  const rec = useRef<Recognizer | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => () => rec.current?.stop(), []);
  const Ctor = getCtor();
  if (!Ctor) return null;

  const start = () => {
    setError(null);
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onTextRef.current(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => { setError(e.error === 'not-allowed' ? 'Allow microphone access to dictate.' : 'Dictation stopped.'); };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const switchLang = () => {
    const next = LANGS[(LANGS.findIndex((l) => l.code === lang) + 1) % LANGS.length].code;
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* storage unavailable */ }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={listening ? () => rec.current?.stop() : start}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${listening ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        aria-pressed={listening}
        title={listening ? 'Stop dictation' : 'Dictate'}
      >
        {listening ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />} {listening ? 'Stop' : 'Dictate'}
      </button>
      {!listening && (
        <button type="button" onClick={switchLang} className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100" title="Dictation language">
          {LANGS.find((l) => l.code === lang)?.label}
        </button>
      )}
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </span>
  );
}
