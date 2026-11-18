'use client';

import React, { useEffect, useRef } from 'react';
import { DEFAULTS, mountLiquidOrb } from './liquid-orb.js';

export { PALETTES } from './liquid-orb.js';

export function LiquidOrb({
  colors,
  mode,
  speed,
  playing,
  size = DEFAULTS.size,
  label = 'Liquid gradient sphere wearing black sunglasses',
  className,
  style,
}) {
  const host = useRef(null);
  const instance = useRef(null);
  const config = useRef({ colors, mode, speed, playing });

  useEffect(() => {
    instance.current = mountLiquidOrb(host.current, config.current);
    return () => {
      instance.current.destroy();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    config.current = { colors, mode, speed, playing };
    instance.current?.setOptions(config.current);
  }, [colors, mode, speed, playing]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={className}
      style={{
        ...style,
        position: 'relative',
        width: size,
        maxWidth: '100%',
        aspectRatio: '1',
        isolation: 'isolate',
      }}
    />
  );
}
