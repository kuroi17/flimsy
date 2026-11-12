import React from 'react';

export function Hero() {
  return (
    <div className="py-12 text-center">
      <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-400 bg-sky-950/60 rounded-full border border-sky-800">
        Localhost Visual Sync Engine
      </span>
      <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
        Flimsy Visual Editor
      </h1>
      <p className="mt-4 max-w-2xl mx-auto text-base text-slate-400">
        Direct UI changes synced directly to codebase without AI token overhead.
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <button className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg shadow-md transition">
          Test Button
        </button>
      </div>
    </div>
  );
}

