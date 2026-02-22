import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * ScrollableTable — wraps any table in an overflow container and shows a
 * "scroll →" hint badge when there is more content to the right.
 * The hint fades away once the user has scrolled near the end.
 */
export default function ScrollableTable({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const remaining = el.scrollWidth - el.scrollLeft - el.clientWidth;
    setCanScrollRight(remaining > 8);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [check]);

  return (
    <div className={`relative ${className}`}>
      <div ref={ref} className="table-container">
        {children}
      </div>
      {canScrollRight && (
        <div className="scroll-hint" aria-hidden="true">
          <ChevronRight size={11} />
          <span>desplazar</span>
        </div>
      )}
    </div>
  );
}
