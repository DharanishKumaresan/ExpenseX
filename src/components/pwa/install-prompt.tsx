'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * "Install ExpenseX" control.
 *
 * Chromium fires `beforeinstallprompt` when the app qualifies for installation
 * and lets us defer it; iOS Safari fires nothing at all and requires the user
 * to go through Share → Add to Home Screen, so that case gets instructions
 * rather than a button that would do nothing.
 *
 * Rendered inside Settings rather than as an interstitial: an app that
 * interrupts someone to ask to be installed has not earned the install.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type State = 'unsupported' | 'available' | 'installed' | 'ios';

export function InstallPrompt() {
  const [state, setState] = useState<State>('unsupported');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari's own flag, which predates the media query.
      (window.navigator as { standalone?: boolean }).standalone === true;

    if (standalone) {
      setState('installed');
      return;
    }

    const ua = window.navigator.userAgent;
    const isIosSafari = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIosSafari) setState('ios');

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setState('available');
    };

    const onInstalled = () => {
      setState('installed');
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (state === 'installed') {
    return (
      <p className="text-[0.875rem] leading-snug text-ink-3">
        ExpenseX is installed on this device and running as an app.
      </p>
    );
  }

  if (state === 'ios') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[0.875rem] leading-snug text-ink-3">
          To install on iPhone or iPad: tap the Share button in Safari, then{' '}
          <span className="font-semibold text-ink">Add to Home Screen</span>.
        </p>
      </div>
    );
  }

  if (state !== 'available' || !deferred) {
    return (
      <p className="text-[0.875rem] leading-snug text-ink-3">
        Your browser will offer to install ExpenseX once it is ready — look for the install icon in
        the address bar, or use the browser menu.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.875rem] leading-snug text-ink-3">
        Install ExpenseX to open it from your home screen or dock, full screen and without browser
        chrome.
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={async () => {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice.outcome === 'accepted') setState('installed');
          setDeferred(null);
        }}
      >
        Install app
      </Button>
    </div>
  );
}
