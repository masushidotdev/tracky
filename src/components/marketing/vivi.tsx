import * as React from 'react';

/** Scroll progress bar (Vivi #prog). */
export function ProgressBar() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      if (ref.current) ref.current.style.width = `${max > 0 ? (el.scrollTop / max) * 100 : 0}%`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div ref={ref} className="mk-progress" aria-hidden="true" />;
}

/** Infinite marquee band (Vivi .band). Items are duplicated for the loop. */
export function MarqueeBand({ items }: { items: Array<string> }) {
  const row = items.map((item) => (
    <span key={item}>
      <span className="a">✦</span> {item}
    </span>
  ));
  return (
    <div className="mk-band disp" aria-hidden="true">
      <div>
        {row}
        {row}
      </div>
    </div>
  );
}

/** Draggable horizontal card strip (Vivi .strip). */
export function DragStrip({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startScroll = 0;
    const onDown = (event: PointerEvent) => {
      down = true;
      startX = event.clientX;
      startScroll = el.scrollLeft;
      el.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (down) el.scrollLeft = startScroll - (event.clientX - startX);
    };
    const onUp = () => {
      down = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []);
  return (
    <div ref={ref} className="mk-strip">
      {children}
    </div>
  );
}

/** Scroll-reveal wrapper (Vivi .rv). */
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('on')),
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`mk-rv ${className}`}>
      {children}
    </div>
  );
}

/** Confetti canvas for the final CTA panel. Static when reduced-motion. */
export function Confetti() {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const colors = ['#d8ff3e', '#ff6ec7', '#7b5cff', '#ffffff'];
    const parts = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      s: 2 + Math.random() * 4,
      c: colors[i % 4],
      v: 0.0008 + Math.random() * 0.002,
      p: Math.random() * 6,
    }));
    let raf = 0;
    const loop = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const part of parts) {
        part.y -= part.v;
        if (part.y < -0.02) {
          part.y = 1.02;
          part.x = Math.random();
        }
        ctx.fillStyle = part.c;
        ctx.save();
        ctx.translate(part.x * canvas.width, part.y * canvas.height);
        ctx.rotate(time * 0.001 + part.p);
        ctx.fillRect(-part.s / 2, -part.s / 2, part.s, part.s * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} id="confetti" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true" />;
}

/** Magnetic hover on the hero CTA (desktop pointer only). */
export function MagnetCta({ href, children, variant = 'big' }: { href: string; children: React.ReactNode; variant?: 'big' | 'pill' }) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * 0.12}px, ${(event.clientY - rect.top - rect.height / 2) * 0.25}px)`;
    };
    const onLeave = () => {
      el.style.transform = '';
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);
  return (
    <a ref={ref} className={variant === 'big' ? 'mk-big-cta' : 'mk-btn'} href={href}>
      {children}
    </a>
  );
}
