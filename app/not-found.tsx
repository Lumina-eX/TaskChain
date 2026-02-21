import React from "react";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-[#050b12] flex flex-col items-center justify-center overflow-hidden text-white">
      {/* Ambient glow blobs */}
      <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-cyan-500/10 blur-[100px] animate-pulse z-0" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-teal-500/10 blur-[100px] animate-pulse z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-purple-700/10 blur-[80px] z-0" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99,179,237,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,179,237,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* Badge */}
        <div className="flex items-center gap-2 border border-cyan-500/20 bg-cyan-500/5 rounded-full px-4 py-1.5 text-cyan-400 text-xs tracking-widest uppercase mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          Powered by Stellar Blockchain
        </div>

        {/* Broken chain visual */}
        <div className="flex items-center mb-6">
          <div className="w-10 h-10 rounded-lg border border-cyan-500/30 bg-[#0d1620] flex items-center justify-center text-cyan-400 text-[9px] font-mono">
            #42
          </div>
          <div className="w-7 h-px bg-linear-to-r from-cyan-400 to-teal-400" />
          <div className="w-10 h-10 rounded-lg border border-cyan-500/30 bg-[#0d1620] flex items-center justify-center text-cyan-400 text-[9px] font-mono">
            #43
          </div>
          <div className="w-7 flex items-center justify-center gap-1">
            <div className="w-2.5 h-px bg-red-400/60" />
            <div className="w-2.5 h-px bg-red-400/60" />
          </div>
          <div className="w-10 h-10 rounded-lg border border-red-500/40 bg-[#0d1620] flex items-center justify-center text-red-400/70 text-[9px] font-mono animate-bounce">
            ???
          </div>
        </div>

        {/* 404 */}
        <h1
          className="font-extrabold leading-none tracking-tighter select-none"
          style={{
            fontSize: "clamp(6rem, 20vw, 14rem)",
            background:
              "linear-gradient(135deg, #ffffff 0%, #63b3ed 50%, #38b2ac 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 60px rgba(99,179,237,0.35))",
          }}
        >
          404
        </h1>

        {/* Headline */}
        <h2 className="text-2xl md:text-3xl font-bold text-white mt-2 mb-3">
          Page Not Found
        </h2>

        {/* Subtext */}
        <p className="text-slate-400 text-sm md:text-base max-w-sm leading-relaxed mb-10">
          This page was not found on the blockchain. It may have never existed,
        </p>

        {/* Buttons */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-[#050b12] bg-linear-to-r from-cyan-400 to-teal-400 hover:opacity-90 hover:-translate-y-0.5 transition-all duration-200 shadow-[0_0_20px_rgba(99,179,237,0.3)]"
          >
            Back to Home
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-cyan-400 border border-cyan-500/25 bg-cyan-500/5 hover:bg-cyan-500/10 hover:-translate-y-0.5 transition-all duration-200"
          >
            How It Works
          </Link>
        </div>

        {/* Hash decoration */}
        <p className="mt-12 text-slate-700 text-xs font-mono tracking-widest select-none">
          TX: 0x4e6f...7465 · STATUS: NOT_FOUND · BLOCK: —
        </p>
      </div>
    </div>
  );
}
