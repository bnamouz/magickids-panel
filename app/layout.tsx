import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'מכון ילדי הקסם – אבחון קשב וריכוז',
  description: 'פלטפורמת אבחון אינטליגנטית להפרעת קשב וריכוז',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="font-sans bg-slate-50 text-slate-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
