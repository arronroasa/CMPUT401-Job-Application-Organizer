'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll-reveal wrapper — fades/slides children in as they enter the viewport
 * (Lodestar .ls-rev behavior).
 */
export default function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.style.opacity = '0';
    el.style.transform = 'translateY(22px)';
    el.style.transition = `opacity .7s ease ${delay}ms, transform .7s cubic-bezier(.2,.8,.2,1) ${delay}ms`;

    const show = () => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            show();
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    const fallback = setTimeout(show, 1800 + delay);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, [delay]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
