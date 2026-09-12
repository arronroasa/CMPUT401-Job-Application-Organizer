import { KanbanSquare } from 'lucide-react';
import type { FeatureModule } from '@onfile/core';
import { ApplicationsRoute } from './routes';

const applicationsFeature: FeatureModule = {
  navItem: { label: 'Applications', path: '/applications', icon: KanbanSquare },
  routes: [{ path: '/applications', element: <ApplicationsRoute /> }],
};

export default applicationsFeature;
