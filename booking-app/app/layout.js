import "./globals.css";

export const metadata = {
  title: "Sandbox booking app",
  description: "System under test for the Repro agent team. Synthetic data only.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
