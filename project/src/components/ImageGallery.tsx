import { useCallback, useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { X, ChevronLeft, ChevronRight, Download, Columns2, Images } from 'lucide-react';

export interface GalleryImage {
  url: string;
  caption: string;
  fileName: string;
}

async function download(img: GalleryImage) {
  try {
    const blob = await (await fetch(img.url)).blob();
    saveAs(blob, img.fileName);
  } catch {
    window.open(img.url, '_blank', 'noopener');
  }
}

// Full-screen viewer for case photos: step through, compare any photo
// side by side with the first one (e.g. pre-op vs post-op), download.
export default function ImageGallery({ images, startIndex = 0, onClose }: { images: GalleryImage[]; startIndex?: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [compare, setCompare] = useState(false);
  const [compareWith, setCompareWith] = useState(0);
  const [busy, setBusy] = useState(false);

  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  const downloadAll = async () => {
    setBusy(true);
    for (const img of images) await download(img);
    setBusy(false);
  };

  const current = images[index];
  const other = images[compareWith];
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition disabled:opacity-40';

  return (
    <div className="keep-dark fixed inset-0 z-[70] bg-slate-950/95 flex flex-col" role="dialog" aria-label="Photo viewer">
      <div className="flex items-center gap-1 px-3 py-2 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
        <p className="text-sm text-white/70 px-2 flex-1 truncate">{index + 1} / {images.length}</p>
        {images.length > 1 && (
          <button onClick={() => setCompare(!compare)} className={`${btn} ${compare ? 'bg-white/15' : ''}`} aria-pressed={compare}>
            <Columns2 className="w-4 h-4" /> <span className="hidden sm:inline">Compare</span>
          </button>
        )}
        <button onClick={() => download(current)} className={btn}><Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span></button>
        {images.length > 1 && (
          <button onClick={downloadAll} disabled={busy} className={btn}><Images className="w-4 h-4" /> <span className="hidden sm:inline">{busy ? 'Saving…' : 'All'}</span></button>
        )}
        <button onClick={onClose} className={btn} aria-label="Close"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 relative">
        {images.length > 1 && (
          <button onClick={prev} className="absolute left-2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Previous"><ChevronLeft className="w-6 h-6" /></button>
        )}
        {compare ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full h-full py-2">
            {[{ img: other, label: 'Left' }, { img: current, label: 'Right' }].map(({ img, label }) => (
              <figure key={label} className="flex flex-col items-center justify-center min-h-0">
                <img src={img.url} alt={img.caption} className="max-h-[38vh] sm:max-h-[72vh] max-w-full object-contain rounded-lg" />
                <figcaption className="text-xs text-white/70 mt-2 text-center">{img.caption}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <figure className="flex flex-col items-center justify-center max-h-full">
            <img src={current.url} alt={current.caption} className="max-h-[78vh] max-w-full object-contain rounded-lg" />
            <figcaption className="text-sm text-white/80 mt-3 text-center">{current.caption}</figcaption>
          </figure>
        )}
        {images.length > 1 && (
          <button onClick={next} className="absolute right-2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Next"><ChevronRight className="w-6 h-6" /></button>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-3 py-3 justify-center" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => (compare ? setCompareWith(i) : setIndex(i))}
              className={`flex-shrink-0 rounded-lg overflow-hidden ring-2 transition ${i === index ? 'ring-sky-400' : compare && i === compareWith ? 'ring-amber-400' : 'ring-transparent opacity-60 hover:opacity-100'}`}
              aria-label={compare ? `Compare with photo ${i + 1}` : `Show photo ${i + 1}`}
            >
              <img src={img.url} alt="" className="w-14 h-14 object-cover" />
            </button>
          ))}
        </div>
      )}
      {compare && <p className="text-center text-[11px] text-white/50 pb-2">Tap a thumbnail to choose the left photo · arrows change the right photo</p>}
    </div>
  );
}
