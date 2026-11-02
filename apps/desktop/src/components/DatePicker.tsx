import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import './date-picker.css';

const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function parse(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) || format(date) !== value ? null : date;
}

export function DatePicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focusDate, setFocusDate] = useState(() => parse(value) || new Date());
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); };
  }, [open, focusDate]);
  const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1, 12);
  const dates = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - first.getDay() + 1, 12));
  const select = (date: Date) => { onChange(format(date)); close(); };
  return <span className="app-date-input"><input aria-label={label} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={draft}
    onBlur={() => { if (draft && !parse(draft)) setDraft(value); }}
    onChange={event => { setDraft(event.target.value); if (event.target.value === '' || parse(event.target.value)) onChange(event.target.value); }} />
    <button ref={trigger} type="button" aria-label={`${label} 달력 열기`} aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      const rect = trigger.current!.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(rect.right - 294, window.innerWidth - 302)), top: rect.bottom + 360 > window.innerHeight ? Math.max(8, rect.top - 350) : rect.bottom + 8 });
      setFocusDate(parse(value) || new Date()); setOpen(!open);
    }}><CalendarDays size={16}/></button>
    {open && createPortal(<div ref={panel} role="dialog" aria-label={`${label} 달력`} className="app-calendar" style={position}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (event.key === 'Tab') setOpen(false);
      }}>
      <header><button type="button" aria-label="이전 달" onClick={() => setFocusDate(new Date(first.getFullYear(), first.getMonth() - 1, 1, 12))}><ChevronLeft size={17}/></button><b aria-live="polite">{first.getFullYear()}년 {first.getMonth() + 1}월</b><button type="button" aria-label="다음 달" onClick={() => setFocusDate(new Date(first.getFullYear(), first.getMonth() + 1, 1, 12))}><ChevronRight size={17}/></button></header>
      <div className="app-calendar-week" aria-hidden="true">{'일월화수목금토'.split('').map(day => <span key={day}>{day}</span>)}</div>
      <div role="grid" aria-label="날짜 선택">{Array.from({ length: 6 }, (_, week) => <div role="row" key={week}>{dates.slice(week * 7, week * 7 + 7).map(date => <button role="gridcell" type="button" key={format(date)} aria-label={format(date)} aria-selected={value === format(date)}
        tabIndex={format(date) === format(focusDate) ? 0 : -1} className={date.getMonth() !== first.getMonth() ? 'outside' : ''} onClick={() => select(date)}
        onKeyDown={event => {
          const days: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -date.getDay(), End: 6 - date.getDay() };
          if (event.key in days) { event.preventDefault(); setFocusDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days[event.key], 12)); }
          if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); setFocusDate(new Date(date.getFullYear(), date.getMonth() + (event.key === 'PageUp' ? -1 : 1), 1, 12)); }
        }}>{date.getDate()}</button>)}</div>)}</div>
      <footer><button type="button" onClick={() => select(new Date())}>오늘</button><button type="button" onClick={close}>닫기</button></footer>
    </div>, document.body)}
  </span>;
}
