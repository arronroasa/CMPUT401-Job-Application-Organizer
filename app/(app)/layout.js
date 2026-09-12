import Providers from '@/components/Providers';

// The authenticated-feeling app shell (sidebar + main). The public landing
// page at "/" lives outside this group, so it renders without the sidebar.
export default function AppLayout({ children }) {
  return <Providers>{children}</Providers>;
}
