import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from '@onfile/ui';
import { FeatureRegistry } from './registry/FeatureRegistry';
import { LandingPage } from './pages/LandingPage';

import profileFeature from '@onfile/feature-profile';
import jobsFeature from '@onfile/feature-jobs';
import resumeStudioFeature from '@onfile/feature-resume-studio';
import applicationsFeature from '@onfile/feature-applications';
import interviewsFeature from '@onfile/feature-interviews';
import insightsFeature from '@onfile/feature-insights';
import settingsFeature from '@onfile/feature-settings';

const registry = new FeatureRegistry()
  .register(jobsFeature)
  .register(applicationsFeature)
  .register(resumeStudioFeature)
  .register(interviewsFeature)
  .register(insightsFeature)
  .register(profileFeature)
  .register(settingsFeature);

// Feature modules declare absolute paths (e.g. "/jobs") because the app
// shell used to be mounted at the site root. It now lives under "/app" so
// the landing page can own "/", so paths are re-rooted here rather than
// touching every feature package.
const APP_PREFIX = '/app';

function reroot(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) => ({
    ...route,
    path: route.path?.startsWith('/') ? route.path.slice(1) : route.path,
  }));
}

const navItems = registry.getNavItems().map((item) => ({
  ...item,
  path: item.path.startsWith('/') ? `${APP_PREFIX}${item.path}` : `${APP_PREFIX}/${item.path}`,
}));

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: APP_PREFIX,
    element: <AppShell navItems={navItems} />,
    children: [
      { index: true, element: <Navigate to={`${APP_PREFIX}/jobs`} replace /> },
      ...reroot(registry.getRoutes()),
    ],
  },
]);
