import "./globals.css";

export const metadata = {
  title: "Patch — From report to verified fix",
  description: "Turn customer reports into reproducible bugs, then fixes you can trust.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400..800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
