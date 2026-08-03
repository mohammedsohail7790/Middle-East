"use client";

import { useState } from "react";

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      {items.map((item, i) => (
        <div key={item.q} className={`faq-item${open === i ? " open" : ""}`}>
          <button
            type="button"
            className="faq-q"
            onClick={() => setOpen(open === i ? null : i)}
          >
            {item.q}
            <span className="faq-icon">+</span>
          </button>
          <div className="faq-a">{item.a}</div>
        </div>
      ))}
    </div>
  );
}
