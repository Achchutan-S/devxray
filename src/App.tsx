import { Suspense, useCallback, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import {
  CommandPalette,
  FileDropzone,
  PwaUpdater,
  ShortcutsModal,
  TabErrorBoundary,
  TabSkeleton,
} from '@/components/common';
import { FocusModeBanner, Header, TabBar, ToolNav, ToolNavDrawer } from '@/components/layout';
import { TAB_COMPONENTS } from '@/components/tabs';
import { TAB_IDS, getTab } from '@/constants/tabs';
import { useHotkeyManager, useImportShareLink, useRouter } from '@/hooks';
import { CONTENT_PAGES } from '@/components/pages';
import { usePreferenceStore, useUIStore } from '@/store';
import { computeTabLayout, tabIdForHotkeyIndex } from '@/utils/tabUtils';

export function App() {
  const theme = usePreferenceStore((state) => state.theme);
  const toggleTheme = usePreferenceStore((state) => state.toggleTheme);
  const pinnedTabs = usePreferenceStore((state) => state.pinnedTabs);
  const tabOrder = usePreferenceStore((state) => state.tabOrder);
  const barTabs = usePreferenceStore((state) => state.barTabs);

  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const focusMode = useUIStore((state) => state.focusMode);
  const toggleFocusMode = useUIStore((state) => state.toggleFocusMode);
  const setFocusMode = useUIStore((state) => state.setFocusMode);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const layout = useMemo(
    () => computeTabLayout(TAB_IDS, pinnedTabs, tabOrder, barTabs),
    [pinnedTabs, tabOrder, barTabs],
  );

  const handleSelectTabByIndex = useCallback(
    (index: number) => {
      const tabId = tabIdForHotkeyIndex(layout, index);
      if (tabId !== undefined) setActiveTab(tabId);
    },
    [layout, setActiveTab],
  );

  const handleToggleTheme = useCallback(() => {
    toggleTheme();
    toast.success(
      usePreferenceStore.getState().theme === 'dark' ? 'Dark theme' : 'Light theme',
    );
  }, [toggleTheme]);

  const isOverlayOpen = useCallback(
    () => paletteOpen || shortcutsOpen || navOpen,
    [paletteOpen, shortcutsOpen, navOpen],
  );

  const handleExitFocusMode = useCallback(() => setFocusMode(false), [setFocusMode]);
  const handleOpenPalette = useCallback(() => setPaletteOpen(true), []);
  const handleOpenShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const handleOpenNav = useCallback(() => setNavOpen(true), []);
  const handleCloseNav = useCallback(() => setNavOpen(false), []);

  useImportShareLink(setActiveTab);
  const { page, navigateToPage, navigateHome, navigateToBase } = useRouter();

  useHotkeyManager({
    onToggleTheme: handleToggleTheme,
    onOpenPalette: handleOpenPalette,
    onToggleFocusMode: toggleFocusMode,
    onExitFocusMode: handleExitFocusMode,
    onOpenShortcuts: handleOpenShortcuts,
    onSelectTabByIndex: handleSelectTabByIndex,
    isOverlayOpen,
  });

  const ActiveTabComponent = TAB_COMPONENTS[activeTab];
  const ContentPage = page !== null ? CONTENT_PAGES[page] : null;
  const tabMeta = getTab(activeTab);

  return (
    <FileDropzone>
      <div className="flex min-h-0 flex-1 flex-col text-fg">
        {!focusMode && (
          <Header
            onOpenPalette={handleOpenPalette}
            onOpenShortcuts={handleOpenShortcuts}
            onOpenNav={handleOpenNav}
            onOpenPage={navigateToPage}
            onNavigateHome={navigateToBase}
          />
        )}

        {focusMode && <FocusModeBanner />}

        {ContentPage ? (
          <Suspense fallback={<TabSkeleton />}>
            <ContentPage onNavigate={navigateToPage} onBack={navigateHome} />
          </Suspense>
        ) : (
        /* Navigation sits beside the workspace, so the tab bar stays with the
           thing it describes: what is currently open. */
        <div className="flex min-h-0 min-w-0 flex-1">
          {!focusMode && <ToolNav onNavigateToPage={navigateToPage} />}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
            {!focusMode && <TabBar />}

            <main
              // Remounting on tab change resets each tool's local state, so switching
              // away and back never resurrects a half-finished operation.
              key={activeTab}
              role="tabpanel"
              aria-label={tabMeta?.label ?? 'Tool'}
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              <h1 className="sr-only">
                {tabMeta ? `${tabMeta.label} — ${tabMeta.description}` : 'Dev X-Ray'}
              </h1>
              <TabErrorBoundary resetKey={activeTab}>
                <Suspense fallback={<TabSkeleton />}>
                  {ActiveTabComponent ? <ActiveTabComponent /> : null}
                </Suspense>
              </TabErrorBoundary>
            </main>
          </div>
        </div>
        )}
      </div>

      <ToolNavDrawer
        isOpen={navOpen}
        onClose={handleCloseNav}
        onNavigateToPage={navigateToPage}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigateToPage={navigateToPage}
      />
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <Toaster
        position="bottom-right"
        theme={theme}
        toastOptions={{
          style: {
            background: 'rgb(var(--dx-surface-raised))',
            border: '1px solid rgb(var(--dx-line))',
            color: 'rgb(var(--dx-fg))',
          },
        }}
      />
      <PwaUpdater />
    </FileDropzone>
  );
}
