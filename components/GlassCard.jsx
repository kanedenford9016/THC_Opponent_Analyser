export default function GlassCard({ title, children }) {
  return (
    <div className="thc-card mb-6 p-5 rounded-xl">
      {title && (
        <h2 className="text-xl font-semibold mb-3 text-glow">{title}</h2>
      )}
      {children}
    </div>
  );
}
