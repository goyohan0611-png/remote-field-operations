import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function RecordingFilterMenu({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = options.find(option => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function focusOption(index: number) {
    root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus();
  }

  return <div className="rec-filter-menu" ref={root}>
    <span className="rec-filter-label">{label}</span>
    <button ref={trigger} type="button" className="rec-filter-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
      onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); requestAnimationFrame(() => focusOption(Math.max(0, options.findIndex(option => option.value === value)))); } }}>
      <span>{selected?.label || '선택'}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="rec-filter-options" role="listbox" aria-label={label} onKeyDown={event => {
      const index = Array.from(root.current?.querySelectorAll('[role="option"]') || []).indexOf(document.activeElement as Element);
      if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(Math.min(options.length - 1, index + 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(Math.max(0, index - 1)); }
      if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
      if (event.key === 'End') { event.preventDefault(); focusOption(options.length - 1); }
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setOpen(false);
    }}>
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value}
        onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}><span>{option.label}</span>{option.value === value && <Check size={14} aria-hidden="true" />}</button>)}
    </div>}
  </div>;
}
