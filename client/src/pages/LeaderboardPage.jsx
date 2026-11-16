import React, { useEffect, useState } from 'react';
import { request } from '../api';

const TABS = [
  ['global', 'Global'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['friends', 'Friends'],
];

export default function LeaderboardPage() {
  const [type, setType] = useState('global');
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('Loading leaderboard…');
  const [myRank, setMyRank] = useState(null);
  const [email, setEmail] = useState('');
  const [friendMsg, setFriendMsg] = useState('');
  const [reload, setReload] = useState(0);
  const loggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    let active = true;
    setMessage('Loading leaderboard…');

    request(`/leaderboard?type=${type}`)
      .then(data => {
        if (!active) return;
        setRows(data.players || []);
        setMessage(data.players?.length ? data.message : 'No scores in this ranking yet.');
      })
      .catch(error => {
        if (!active) return;
        setRows([]);
        setMessage(error.message);
      });

    return () => { active = false; };
  }, [type, reload]);

  useEffect(() => {
    if (!loggedIn) return;
    request('/leaderboard/me').then(d => setMyRank(d.rank)).catch(() => {});
  }, [loggedIn]);

  const addFriend = async event => {
    event.preventDefault();

    try {
      const data = await request('/friends/add', { method: 'POST', body: JSON.stringify({ email }) });
      setFriendMsg(`${data.name} added!`);
      setEmail('');
      setReload(v => v + 1);
    } catch (error) {
      setFriendMsg(error.message);
    }
  };

  return (
    <main className="content-page">
      <span className="eyebrow">TOP ADVENTURERS</span>
      <h1>Leaderboard</h1>

      <div className="lb-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={type === key}
            className={type === key ? 'on' : ''}
            onClick={() => setType(key)}
          >{label}</button>
        ))}
      </div>

      {loggedIn && myRank && <p className="lb-me">Your rank: <b>#{myRank}</b></p>}
      <p className="leaderboard-note">{message}</p>

      <div className="leaderboard-card">
        {rows.map(player => (
          <div className="leader-row" key={`${player.rank}-${player.name}`}>
            <b>{player.rank <= 3 ? ['🥇', '🥈', '🥉'][player.rank - 1] : `#${player.rank}`}</b>
            <span>{player.name}</span>
            <small>★{player.totalStars || 0} · {player.levelsCompleted || 0} lvls · ×{player.bestCombo || 0}</small>
            <strong>{Number(player.totalScore || 0).toLocaleString()} pts</strong>
          </div>
        ))}
      </div>

      {type === 'friends' && loggedIn && (
        <form className="friend-form" onSubmit={addFriend}>
          <input type="email" required placeholder="Friend's email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Friend email" />
          <button type="submit" className="cta">Add friend</button>
          {friendMsg && <p role="status">{friendMsg}</p>}
        </form>
      )}
      {type === 'friends' && !loggedIn && <p>Log in to build a friends leaderboard.</p>}
    </main>
  );
}
