import React from 'react';
import { Trophy, RotateCcw, ArrowRight } from 'lucide-react';

export const GameOverModal = ({ isWin, score, stars = 3, onRestart, onNextLevel }) => {
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4">
          <Trophy className={`w-8 h-8 ${isWin ? 'text-yellow-400' : 'text-slate-500'}`} />
        </div>

        <h2 className={`text-3xl font-extrabold mb-1 ${isWin ? 'text-emerald-400' : 'text-rose-500'}`}>
          {isWin ? 'Level Cleared!' : 'Game Over'}
        </h2>

        <p className="text-sm text-slate-400 mb-5">
          {isWin ? 'Great aim! All bubbles cleared.' : 'Bubbles crossed the danger line!'}
        </p>

        {isWin && (
          <div className="flex justify-center gap-2 text-2xl mb-5">
            {[1, 2, 3].map((s) => (
              <span key={s} className={s <= stars ? 'text-yellow-400' : 'text-slate-700'}>
                ★
              </span>
            ))}
          </div>
        )}

        <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-4 mb-6">
          <span className="text-xs uppercase tracking-wider text-slate-400 block">Final Score</span>
          <span className="text-3xl font-black text-white">{score.toLocaleString()}</span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>

          {isWin && (
            <button
              onClick={onNextLevel}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white font-semibold py-3 rounded-xl transition"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
