import type { RouteObject } from 'react-router-dom';
import type { ElementType } from 'react';

export interface NavItem {
  label: string;
  path: string;
  icon: ElementType;
}

export interface FeatureModule {
  navItem: NavItem;
  routes: RouteObject[];
}
