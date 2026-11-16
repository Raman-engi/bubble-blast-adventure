import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api';
import { Mascot } from '../components/Mascot';
import { dailyFor, readDailyLocal, todayKey } from '../game/daily';
import { ITEM_META } from '../game/economy';

/* Daily challenge: same puzzle for everybody today, bonus coins + a streak. */
export default function DailyPage() {
  const daily = dailyFor();
  const [info, setInfo] = useState(null);
  const loggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    if (!loggedIn) return undefined;
    let active = true;

    request('/daily-challenge')
      .then(data => active && setInfo(data))
      .catch(() => {});

    return () => { active = false; };
  }, [loggedIn]);

  const local = readDailyLocal();
  const day = todayKey();
  const done = loggedIn ? info?.completedToday : local.lastDate === day;
  const streak = loggedIn ? info?.streak || 0 : local.streak || 0;
  const best = loggedIn ? info?.best : local.best?.[day];
  const meta = ITEM_META[daily.reward.booster];

  return (
    <main className="content-page daily-page">
      <span className="eyebrow">NEW PUZZLE EVERY DAY</span>
      <h1>Daily Challenge</h1>

      <Mascot
        mood={done ? 'cheer' : 'wink'}
        say={done ? 'Done for today! Come back tomorrow to keep your streak.' : 'Today\'s puzzle is waiting. Beat it to grow your streak!'}
      />

      <div className="daily-card">
        <div className="daily-row"><small>DAILY #{daily.date}</small><b>Level {daily.level}</b></div>
        <div className="daily-row"><small>OBJECTIVE</small><b>{daily.objective.replace('_', ' ')}</b></div>
        <div className="daily-row"><small>SHOTS</small><b>{daily.shots}</b></div>
        <div className="daily-row"><small>REWARD</small><b>🪙 +{daily.reward.coins} · {meta.icon} +1 {meta.label}</b></div>
        <div className="daily-row"><small>STREAK</small><b>🔥 {streak} day{streak === 1 ? '' : 's'} (+20 🪙 per streak day, max 10)</b></div>
        <div className="daily-row"><small>BEST TODAY</small><b>{best ? `${Number(best.score).toLocaleString()} pts · ${best.stars}★` : '—'}</b></div>

        <Link className="cta" to={`/game/${daily.level}?daily=1`}>
          {done ? '↻ Play again (no extra reward)' : '▶ Play today\'s challenge'}
        </Link>

        {!loggedIn && (
          <p className="daily-note">Playing as guest: streak is saved on this device only. <Link to="/login">Log in</Link> to keep it across devices.</p>
        )}
      </div>
    </main>
  );
}
