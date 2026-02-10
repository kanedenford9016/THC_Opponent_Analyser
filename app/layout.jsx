import "../styles/globals.css";

export const metadata = {
  title: "THC Edge",
  description: "Behaviour • Threat • Strategy Engine",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        {children}
      </body>
    </html>
  );
}
