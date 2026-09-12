import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { NavItem } from '@onfile/core';
import { cn } from '../utils/cn';

interface SidebarProps {
  navItems: NavItem[];
}

export function Sidebar({ navItems }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r border-border bg-card transition-all duration-200',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 px-3 py-4 border-b border-border h-14">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground text-xs font-bold font-[Quicksand]">O</span>
        </div>
        {!collapsed && (
          <span className="text-foreground text-sm font-semibold tracking-tight truncate font-[Quicksand]">
            OnFile
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-foreground/60 hover:bg-muted hover:text-foreground'
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Streak widget (Lodestar theme) */}
      {!collapsed && (
        <div className="mx-2 mb-2 rounded-2xl bg-muted border border-border px-3.5 py-3">
          <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">Streak</div>
          <div className="font-[Quicksand] font-semibold text-xl mt-1 text-foreground">6 days</div>
          <div className="text-xs text-muted-foreground mt-0.5">Two a day beats twenty on Sunday.</div>
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="px-2 py-3 border-t border-border">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-3 w-full rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 shrink-0" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
