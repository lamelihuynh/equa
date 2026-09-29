import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './styles.css';
import './demo.css';

export const metadata: Metadata = {
  title: 'Equa',
  description: 'Shared expenses, made clear.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
