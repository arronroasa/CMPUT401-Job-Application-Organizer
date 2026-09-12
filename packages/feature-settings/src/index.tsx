import { Settings } from 'lucide-react';
import type { FeatureModule } from '@onfile/core';
import { SettingsRoute } from './routes';

const settingsFeature: FeatureModule = {
  navItem: { label: 'Settings', path: '/settings', icon: Settings },
  routes: [{ path: '/settings', element: <SettingsRoute /> }],
};

export default settingsFeature;
