import { useEffect, useRef, useState } from "react";

export interface PanelMenuItem {
  label: string;
  onClick: () => void;
}

interface PanelMenuProps {
  items: PanelMenuItem[];
}

export function PanelMenu({ items }: PanelMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!items.length) return null;

  return (
    <div className="panel-menu" ref={menuRef}>
      <button
        type="button"
        className="panel-menu-btn"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="icon-menu-dots" aria-hidden="true" />
      </button>
      {open ? (
        <div className="panel-menu-dropdown" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="panel-menu-item"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
