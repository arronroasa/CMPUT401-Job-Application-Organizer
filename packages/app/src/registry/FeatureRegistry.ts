import type { FeatureModule, NavItem } from '@onfile/core';
import type { RouteObject } from 'react-router-dom';

export class FeatureRegistry {
  private modules: FeatureModule[] = [];

  register(module: FeatureModule): this {
    this.modules.push(module);
    return this;
  }

  getNavItems(): NavItem[] {
    return this.modules.map((m) => m.navItem);
  }

  getRoutes(): RouteObject[] {
    return this.modules.flatMap((m) => m.routes);
  }
}
