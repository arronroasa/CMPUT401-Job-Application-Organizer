'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ content, children, delay = 300 }) {
    const [show, setShow] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const timerRef = useRef(null);

    const handleEnter = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        timerRef.current = setTimeout(() => {
            setCoords({ x: rect.left + rect.width / 2, y: rect.top });
            setShow(true);
        }, delay);
    };

    const handleLeave = () => {
        clearTimeout(timerRef.current);
        setShow(false);
    };

    if (!content) return children;

    return (
        <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
            {children}
            {show &&
                createPortal(
                    <div
                        className="fixed z-[999] max-w-[240px] -translate-x-1/2 -translate-y-full
                        rounded-lg bg-ink text-paper text-[12px] leading-snug px-3 py-2 shadow-xl
                        pointer-events-none"
                        style={{ left: coords.x, top: coords.y - 8 }}
                    >
                        {content}
                    </div>,
                    document.body
                )}
        </div>
    );
}