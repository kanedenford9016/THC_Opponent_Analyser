import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div
      className="
        min-h-screen 
        flex flex-col items-center justify-center 
        text-center 
        relative overflow-hidden
        px-6
      "
    >
      {/* BACKGROUND GRADIENT */}
      <div
        className="
          absolute inset-0 
          bg-[radial-gradient(circle_at_center,rgba(255,0,118,0.28),#000)]
          animate-pulse-slow
        "
      ></div>

        <div className="relative z-10 mb-10 w-full max-w-[900px]">
          {/* Aspect ratio wrapper (16:9) */}
          <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden shadow-[0_0_40px_rgba(255,0,118,0.4)]">
            <Image
              src="/thc_logo.png"
              alt="THC Logo"
              fill
              className="object-cover" 
            />
          </div>
        </div>


      {/* TITLE */}
      <h1
        className="
          text-6xl 
          font-bold 
          tracking-wide 
          text-thcMagenta 
          drop-shadow-[0_0_25px_rgba(255,0,118,0.7)]
          mb-3
          relative z-10
        "
      >
        THC Edge
      </h1>

      {/* SUBTITLE */}
      <p className="text-xl text-white/80 mb-10 relative z-10">
        Behaviour • Threat • Strategy Engine
      </p>

      {/* LAUNCH BUTTON */}
      <Link
        href="/analyze"
        className="
          thc-btn text-xl px-12 py-4 rounded-xl 
          shadow-[0_0_25px_rgba(255,0,118,0.6)]
          relative z-10
        "
      >
        Launch Analyzer
      </Link>

      {/* FOOTER */}
      <p className="text-white/40 text-sm mt-12 relative z-10">
        THC Edge © 2025 — Web Edition
      </p>
    </div>
  );
}
