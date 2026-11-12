import React from 'react';
import { Hero } from './components/Hero.tsx';
import { Card } from './components/Card.tsx';

export default function App() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <Hero />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Card
          title="Instant Feedback"
          description="Click any element on localhost to edit text and Tailwind classes directly."
        />
        <Card
          title="Deterministic AST"
          description="No AI tokens or screenshots required. Changes cleanly commit to physical TSX files."
        />
      </div>
    </main>
  );
}
