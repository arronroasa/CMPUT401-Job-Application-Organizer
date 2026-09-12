import { BarChart2 } from 'lucide-react';
import type { FeatureModule } from '@onfile/core';
import { InsightsRoute } from './routes';

const insightsFeature: FeatureModule = {
  navItem: { label: 'Insights', path: '/insights', icon: BarChart2 },
  routes: [{ path: '/insights', element: <InsightsRoute /> }],
};

export default insightsFeature;
