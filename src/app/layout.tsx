import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import { getCurrentUser } from '@/server/auth/session';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

/**
 * Archivo is the grotesk that carries the editorial headlines; JetBrains Mono
 * carries every figure and micro-label. Money is always monospaced and
 * tabular so that a column of amounts lines up digit for digit.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500', '700', '800'],
});

export const metadata: Metadata = {
  title: {
    default: 'ExpenseX',
    template: '%s · ExpenseX',
  },
  description:
    'A financial operating system for one person or two — budgets, goals, spending and a shared workspace.',
  applicationName: 'ExpenseX',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#adb3a1' },
    { media: '(prefers-color-scheme: dark)', color: '#0e120d' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Runs before first paint so the correct palette is already on <html>.
 * Without it a dark-mode user gets a full-screen flash of sage on every load.
 */
const themeBootstrap = `
(function(){
  try {
    var stored = localStorage.getItem('ex-theme') || 'system';
    var resolved = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-pref', stored);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {/* The theme the user saved, applied once React takes over. */}
        {user ? <ThemeSync theme={user.theme} /> : null}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

function ThemeSync({ theme }: { theme: string }) {
  const script = `
    try {
      var pref = ${JSON.stringify(theme)};
      if (localStorage.getItem('ex-theme') !== pref) {
        localStorage.setItem('ex-theme', pref);
        var resolved = pref === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : pref;
        document.documentElement.setAttribute('data-theme', resolved);
        document.documentElement.setAttribute('data-theme-pref', pref);
      }
    } catch (e) {}
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
