import { AdminShell } from './AdminShell';
import { AdminScrollArea } from './AdminScrollArea';
import { AdminTabs, type TabDef } from './AdminTabs';
import { useTabParam } from './useTabParam';

/**
 * Factory for simple admin pages that wrap a single content component
 * in AdminShell (+ optionally AdminScrollArea).
 */
export function createSimpleAdminPage(config: {
  title: string;
  subtitle?: string;
  currentPath: string;
  component: React.ComponentType;
  /** Wrap content in AdminScrollArea. Defaults to true. */
  scrollArea?: boolean;
}) {
  const { title, subtitle, currentPath, component: Content, scrollArea = true } = config;

  function Page() {
    return (
      <AdminShell title={title} subtitle={subtitle} currentPath={currentPath}>
        {scrollArea ? (
          <AdminScrollArea>
            <Content />
          </AdminScrollArea>
        ) : (
          <Content />
        )}
      </AdminShell>
    );
  }

  // Preserve a useful display name for React DevTools
  Page.displayName = `AdminPage(${currentPath})`;

  return Page;
}

/**
 * Factory for tabbed admin pages using AdminShell + AdminTabs + AdminScrollArea.
 */
export function createTabbedAdminPage(config: {
  title: string;
  subtitle?: string;
  currentPath: string;
  tabs: Array<{
    value: string;
    label: string;
    icon?: React.ReactNode;
    component: React.ComponentType;
  }>;
  defaultTab?: string;
}) {
  const { title, subtitle, currentPath, tabs: tabConfigs, defaultTab } = config;
  const firstTab = defaultTab ?? tabConfigs[0].value;
  const validKeys = tabConfigs.map((t) => t.value);

  const tabDefs: TabDef[] = tabConfigs.map((t) => ({
    key: t.value,
    label: t.label,
    icon: t.icon,
  }));

  function Page() {
    const [activeTab, setActiveTab] = useTabParam(firstTab, validKeys);

    return (
      <AdminShell title={title} subtitle={subtitle} currentPath={currentPath}>
        <AdminTabs tabs={tabDefs} activeTab={activeTab} onTabChange={setActiveTab} />
        <AdminScrollArea>
          {tabConfigs.map((t) =>
            activeTab === t.value ? <t.component key={t.value} /> : null,
          )}
        </AdminScrollArea>
      </AdminShell>
    );
  }

  Page.displayName = `AdminTabbedPage(${currentPath})`;

  return Page;
}

// Simple factory used by index.astro: returns a redirect shell to /admin/content
export function createAdminPage(_name: string) {
  function Page() {
    if (typeof window !== "undefined") {
      window.location.replace("/admin/content");
    }
    return null;
  }
  Page.displayName = `AdminPage(${_name})`;
  return Page;
}
