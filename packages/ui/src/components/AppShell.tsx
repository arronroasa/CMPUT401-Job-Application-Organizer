import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { NavItem } from '@onfile/core';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  navItems: NavItem[];
  children?: ReactNode;
}

export function AppShell({ navItems, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar navItems={navItems} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-0">
          {children ?? <Outlet />}
        </div>
      </div>
    </div>
  );
}
