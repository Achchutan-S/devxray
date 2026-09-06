import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Hourly check for a newer service worker. */
const UPDATE_POLL_MS = 60 * 60 * 1000;

/**
 * The app registers its service worker with `registerType: 'prompt'`, so a new
 * version never activates underneath the user mid-edit. This component is what
 * offers the swap — without it, updates would never be applied at all.
 */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_POLL_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;

    const id = toast('A new version of Dev X-Ray is available', {
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: () => void updateServiceWorker(true),
      },
      cancel: {
        label: 'Later',
        onClick: () => setNeedRefresh(false),
      },
    });

    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
