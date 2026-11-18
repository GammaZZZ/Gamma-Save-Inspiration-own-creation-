import React, { useEffect, useRef, useState } from 'react';
import { createPortraitWake, DEFAULT_SETTINGS } from './portrait-wake.js';

/** Pass a photo URL and, optionally, a grayscale matte with white over the subject. */
export function AsciiPortrait({ src, matte, settings, original = false, className, style }) {
  const canvas = useRef(null);
  const renderer = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    const engine = createPortraitWake(canvas.current, { image: src, matte });
    renderer.current = engine;
    engine.ready.catch((failure) => {
      if (active) setError(failure.message);
    });
    return () => {
      active = false;
      renderer.current = null;
      engine.destroy();
    };
  }, [src, matte]);

  useEffect(() => {
    renderer.current?.setSettings({ ...DEFAULT_SETTINGS, ...settings });
    renderer.current?.setOriginal(original);
  }, [src, matte, settings, original]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', aspectRatio: '1.15', ...style }}>
      <canvas
        ref={canvas}
        tabIndex={original ? -1 : 0}
        aria-label={original ? 'Original photograph' : 'Interactive portrait. Use arrow keys to move and Enter for a ripple.'}
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', touchAction: original ? 'auto' : 'none', cursor: original ? 'default' : 'crosshair' }}
      >
        An interactive portrait rendered in ink dots.
      </canvas>
      {error && <p role="alert" style={{ position: 'relative', margin: 0, padding: 16 }}>{error}</p>}
    </div>
  );
}
