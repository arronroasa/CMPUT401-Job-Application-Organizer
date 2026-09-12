import { FileText } from 'lucide-react';
import type { FeatureModule } from '@onfile/core';
import { ResumeStudioRoute } from './routes';

const resumeStudioFeature: FeatureModule = {
  navItem: { label: 'Resume Studio', path: '/resume-studio', icon: FileText },
  routes: [{ path: '/resume-studio', element: <ResumeStudioRoute /> }],
};

export default resumeStudioFeature;
