import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api';

/* Previous game sessions stored by the backend (/api/games/history). */
export default function HistoryPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const loggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    if (!loggedIn) return undefined;
    let active = true;

    request('/games/history')
      .then(data => active && setRows(data.sessions || []))
      .catch(e => active && setError(e.message));

    return () => { active = false; };
  }, [loggedIn]);

  if (!loggedIn) {
    return (
      <main className="content-page">
        <h1>Game History</h1>
        <p>Log in to see your previous sessions.</p>
        <Link className="cta" to="/login">Login</Link>
      </main>
    );
  }

  return (
    <main className="content-page">
      <span className="eyebrow">YOUR LAST 50 GAMES</span>
      <h1>Game History</h1>
      {error && <p role="alert">{error}</p>}
      {!rows && !error && <p>Loading history…</p>}
      {rows?.length === 0 && <p>No games yet. Play a level first!</p>}

      <div className="history-list">
        {rows?.filter(r => r.status === 'completed').map(row => (
          <article className="history-row" key={row._id}>
            <b>Level {row.levelId}</b>
            <span>{row.completed ? '✅ Completed' : '❌ Failed'}</span>
            <span>{'★'.repeat(row.stars || 0)}{'☆'.repeat(3 - (row.stars || 0))}</span>
            <span>Score {Number(row.score || 0).toLocaleString()}</span>
            <span>Shots {row.shotsUsed}</span>
            <span>Combo ×{row.bestCombo || 0}</span>
            <small>{new Date(row.completedAt || row.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</small>
          </article>
        ))}
      </div>
    </main>
  );
}
