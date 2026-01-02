import { Link, Outlet, useLocation } from 'react-router-dom';
import OfflineBanner from './OfflineBanner';

const navLinks = [
  { to: '/system/status', label: 'Estado del sistema' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/classification/level1/new', label: 'Clasificar L1' }
];

const Layout = () => {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-gray-50">
      <OfflineBanner />
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-bold text-primary">
            SAM-3 LOD1
          </Link>
          <nav className="flex gap-4 text-sm font-medium text-gray-700">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`rounded px-3 py-2 hover:bg-gray-100 ${pathname.startsWith(link.to) ? 'bg-gray-200 text-gray-900' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
