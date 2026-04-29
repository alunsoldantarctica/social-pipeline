import { useState, Component, type ErrorInfo, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Menu,
  X,
  ChevronLeft,
  Loader2,
  LogOut,
  AlertTriangle,
  Shield,
  ShieldX,
  BookOpen,
  FileText,
  TrendingUp,
  ChevronDown,
  Building2,
  Plus,
} from 'lucide-react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { cn } from '../../../lib/utils';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { SignInButtons } from '../SignInButtons';
import { NotificationBell } from './NotificationBell';
import { OfflineBanner } from './OfflineBanner';
import { PendingActionsBadge } from './PendingActionsBadge';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';

/**
 * Error boundary that catches stale-auth Convex errors (e.g. after logout)
 * and shows the login screen instead of crashing.
 */
class AdminAuthErrorBoundary extends Component<
  { children: ReactNode },
  { hasAuthError: boolean }
> {
  state = { hasAuthError: false };

  static getDerivedStateFromError(error: any) {
    const msg = error.message || '';
    const data = typeof error.data === 'string' ? error.data : '';
    if (
      msg.includes('Authentication required') ||
      msg.includes('Admin access required') ||
      data.includes('Authentication required') ||
      data.includes('Admin access required')
    ) {
      return { hasAuthError: true };
    }
    throw error; // re-throw non-auth errors
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn('[AdminShell] Auth error caught, showing login screen', error.message);
  }

  render() {
    if (this.state.hasAuthError) {
      return (
        <div className="h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 sm:p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-teal-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-teal-500" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Session Expired</h2>
              <p className="text-slate-400">
                Your session has ended. Please sign in again.
              </p>
            </div>
            <SignInButtons
              darkMode={true}
              heading="Sign in to continue"
              subheading="Admin privileges required after sign-in"
              onSuccess={() => window.location.reload()}
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Error boundary to catch Convex client failures and rendering crashes.
 * Prevents the "black screen" by showing a user-friendly error message.
 */
class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Admin panel error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 sm:p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-slate-400 mb-4">
              The admin panel encountered an error. Try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Silent error boundary for non-critical UI (e.g. NotificationBell).
 * Renders nothing on failure instead of crashing the whole admin panel.
 */
class AdminSilentErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[AdminShell] Non-critical component error suppressed:', error.message);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/**
 * Navigation items for the admin sidebar
 */
interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
  badgeKey?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Overview & stats',
  },
  {
    name: 'Content',
    href: '/admin/content',
    icon: <FileText className="w-5 h-5" />,
    description: 'Blog & pipeline',
  },
  {
    name: 'Analytics',
    href: '/admin/analytics',
    icon: <TrendingUp className="w-5 h-5" />,
    description: 'AI cost & pipeline metrics',
  },
  {
    name: 'Action Log',
    href: '/admin/action-log',
    icon: <BookOpen className="w-5 h-5" />,
    description: 'Admin action history',
  },
];

interface AdminShellProps {
  /** The main content to display */
  children: React.ReactNode;
  /** Title for the page */
  title?: string;
  /** Subtitle for the page */
  subtitle?: string;
  /** Current page path for highlighting active nav item */
  currentPath?: string;
  /** Whether to show back button */
  showBack?: boolean;
  /** Callback for back button */
  onBack?: () => void;
}

function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const { workspace, allWorkspaces, switchWorkspace } = useWorkspace();

  if (!workspace || !allWorkspaces || allWorkspaces.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
        <Building2 className="w-4 h-4 text-teal-500 shrink-0" />
        <span className="truncate font-medium text-white">{workspace?.name ?? '—'}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors"
      >
        <Building2 className="w-4 h-4 text-teal-500 shrink-0" />
        <span className="flex-1 truncate text-left font-medium text-white">{workspace.name}</span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-xl z-10">
          {allWorkspaces.map((ws) => (
            <button
              key={ws._id}
              onClick={async () => {
                await switchWorkspace(ws._id as Id<'workspaces'>);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left',
                ws._id === workspace._id
                  ? 'bg-teal-600/20 text-teal-400'
                  : 'text-slate-300 hover:bg-slate-700',
              )}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{ws.name}</span>
            </button>
          ))}
          <a
            href="/admin/onboarding"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 transition-colors border-t border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New workspace</span>
          </a>
        </div>
      )}
    </div>
  );
}

function AdminShellInner({
  children,
  title,
  subtitle,
  currentPath = '/admin',
  showBack,
  onBack,
}: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = useQuery(api.users.checkIsAdmin);
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const badgeCounts: Record<string, number> = {};

  // Loading state - keep spinner while auth initializes, user doc loads, admin check resolves, or workspace loads
  if (isLoading || (isAuthenticated && (currentUser === undefined || isAdmin === undefined || wsLoading))) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Auth required
  if (!isAuthenticated || !currentUser) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 sm:p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-teal-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-teal-500" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Admin Access</h2>
            <p className="text-slate-400">
              Sign in to access the admin panel
            </p>
          </div>
          <SignInButtons
            darkMode={true}
            heading="Sign in to continue"
            subheading="Admin privileges required after sign-in"
            onSuccess={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  // No workspace → redirect to onboarding (client-side)
  if (isAdmin && !workspace && currentPath !== '/admin/onboarding') {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/onboarding';
    }
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  // Admin role required - authenticated but not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 sm:p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-6">
            Your account does not have admin privileges.
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors"
          >
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  // Determine active nav item
  const isActive = (href: string) => {
    if (href === '/admin') {
      return currentPath === '/admin' || currentPath === '/admin/';
    }
    return currentPath.startsWith(href);
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-950 flex">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform lg:translate-x-0 lg:static lg:z-auto flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo/Brand */}
        <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-slate-800">
          <a href="/admin" className="flex items-center gap-2 text-white font-semibold">
            <Shield className="w-6 h-6 text-teal-500" />
            <span>Admin Panel</span>
          </a>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace switcher */}
        <div className="shrink-0 px-2 py-2 border-b border-slate-800">
          <WorkspaceSwitcher />
        </div>

        {/* Navigation (scrollable) */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive(item.href)
                  ? 'bg-teal-600/20 text-teal-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              {item.icon}
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{item.name}</span>
                {item.description && (
                  <span className="block text-xs text-slate-500 truncate">
                    {item.description}
                  </span>
                )}
              </div>
              {item.badgeKey && badgeCounts[item.badgeKey] > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-medium min-w-[20px] text-center',
                  item.badgeKey === 'activeTrips'
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'bg-amber-500/20 text-amber-400'
                )}>
                  {badgeCounts[item.badgeKey]}
                </span>
              )}
            </a>
          ))}
        </nav>

        {/* User section */}
        <div className="shrink-0 p-4 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <a
              href="/admin/settings"
              className="flex-1 flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors group min-w-0"
            >
              <div className="w-8 h-8 bg-teal-600/20 rounded-full flex items-center justify-center shrink-0">
                <span className="text-teal-400 text-sm font-medium">
                  {currentUser.name?.[0] || currentUser.email?.[0] || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate group-hover:text-teal-400 transition-colors">{currentUser.name || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
              </div>
            </a>
            <button
              onClick={() => signOut()}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="h-16 shrink-0 flex items-center gap-4 px-4 sm:px-6 lg:px-8 border-b border-slate-800 bg-slate-900/50">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Back button */}
          {showBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>
          )}

          {/* Title */}
          <div className="flex-1 min-w-0">
            {title && <h1 className="text-lg font-semibold text-white truncate">{title}</h1>}
            {subtitle && <p className="text-sm text-slate-400 truncate">{subtitle}</p>}
          </div>

          {/* Offline pending actions badge */}
          <AdminSilentErrorBoundary>
            <PendingActionsBadge />
          </AdminSilentErrorBoundary>

          {/* Notification bell — isolated so push errors don't crash the panel */}
          <AdminSilentErrorBoundary>
            <NotificationBell />
          </AdminSilentErrorBoundary>
        </header>

        {/* Offline indicator */}
        <OfflineBanner />

        {/* Page content */}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</main>
      </div>
    </div>
  );
}

export function AdminShell(props: AdminShellProps) {
  return (
    <AdminErrorBoundary>
      <ConvexClientProvider>
        <AdminAuthErrorBoundary>
          <WorkspaceProvider>
            <AdminShellInner {...props} />
          </WorkspaceProvider>
        </AdminAuthErrorBoundary>
      </ConvexClientProvider>
    </AdminErrorBoundary>
  );
}

export default AdminShell;
