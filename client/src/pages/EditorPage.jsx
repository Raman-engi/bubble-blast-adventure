import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { request } from '../api';
import GameCanvas from '../game/GameCanvas';
import { COLORS } from '../game/levels';
import { COLS } from '../game/logic';
import {
  EDITOR_ROWS, OBJECTIVE_TYPES, blankLevel, buildCustomConfig,
  deleteLocalLevel, getLocalLevel, listLocalLevels, saveLocalLevel,
} from '../game/customLevels';
import { getInventory } from '../game/economy';

const TOOLS = [
  ...COLORS.map((color, index) => ({ key: `c${index}`, label: `Colour ${index + 1}`, color, value: index })),
  { key: 'stone', label: 'Stone', color: '#7a8699', value: { type: 'stone' } },
  { key: 'bomb', label: 'Bomb bubble', color: '#222', value: { type: 'bomb' } },
  { key: 'erase', label: 'Erase', color: 'transparent', value: null },
];

const cellColor = cell =>
  Number.isInteger(cell) ? COLORS[cell]
    : cell?.type === 'stone' ? '#7a8699'
      : cell?.type === 'bomb' ? '#222' : 'transparent';

/* Visual level editor: paint a hex board, set shots + objective, test it, save it. */
export default function EditorPage() {
  const nav = useNavigate();
  const [level, setLevel] = useState(() => listLocalLevels()[0] || blankLevel());
  const [tool, setTool] = useState(TOOLS[0]);
  const [saved, setSaved] = useState(listLocalLevels);
  const [community, setCommunity] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState('');
  const [painting, setPainting] = useState(false);

  useEffect(() => {
    request('/custom-levels').then(d => setCommunity(d.levels || [])).catch(() => {});

    if (localStorage.getItem('token')) {
      request('/admin/me').then(d => setIsAdmin(!!d.isAdmin)).catch(() => {});
    }
  }, []);

  const paint = useCallback((r, c) => {
    setLevel(prev => {
      const board = prev.board.map(row => row.slice());
      board[r][c] = tool.value;
      return { ...prev, board };
    });
  }, [tool]);

  const set = (key, value) => setLevel(prev => ({ ...prev, [key]: value }));

  const filled = useMemo(
    () => level.board.flat().filter(cell => cell !== null && cell !== undefined).length,
    [level.board]
  );

  const save = () => {
    saveLocalLevel(level);
    setSaved(listLocalLevels());
    setMessage('Saved on this device ✔');
  };

  const test = () => {
    if (!filled) { setMessage('Paint some bubbles first.'); return; }
    saveLocalLevel(level);
    nav(`/play/custom/${level.id}`);
  };

  const publish = async () => {
    try {
      await request('/admin/levels', { method: 'POST', body: JSON.stringify({ ...level, isPublished: true }) });
      setMessage('Published! Everyone can play it now.');
      request('/custom-levels').then(d => setCommunity(d.levels || []));
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="content-page editor-page">
      <span className="eyebrow">BUILD YOUR OWN</span>
      <h1>Level Editor</h1>

      <div className="editor-tools" role="radiogroup" aria-label="Brush">
        {TOOLS.map(item => (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={tool.key === item.key}
            aria-label={item.label}
            title={item.label}
            className={`tool ${tool.key === item.key ? 'on' : ''}`}
            style={{ background: item.color }}
            onClick={() => setTool(item)}
          >{item.key === 'erase' ? '⌫' : item.key === 'bomb' ? '💣' : item.key === 'stone' ? '🪨' : ''}</button>
        ))}
      </div>

      <div
        className="editor-board"
        onPointerUp={() => setPainting(false)}
        onPointerLeave={() => setPainting(false)}
      >
        {level.board.map((row, r) => (
          <div className={`editor-row ${r % 2 ? 'odd' : ''}`} key={r}>
            {row.slice(0, COLS).map((cell, c) => (
              <button
                key={c}
                type="button"
                className="editor-cell"
                aria-label={`Row ${r + 1} column ${c + 1}`}
                style={{ background: cellColor(cell) }}
                onPointerDown={() => { setPainting(true); paint(r, c); }}
                onPointerEnter={() => painting && paint(r, c)}
              >{cell?.type === 'bomb' ? '💣' : cell?.type === 'stone' ? '🪨' : ''}</button>
            ))}
          </div>
        ))}
      </div>
      <p className="editor-hint">Bubbles must touch the top row, otherwise they fall when the level starts. {filled} bubbles painted ({EDITOR_ROWS} rows).</p>

      <div className="editor-form">
        <label>Name<input value={level.name} maxLength={40} onChange={e => set('name', e.target.value)} /></label>
        <label>Shots<input type="number" min={5} max={60} value={level.shots} onChange={e => set('shots', Number(e.target.value))} /></label>
        <label>Colours (2-6)<input type="number" min={2} max={6} value={level.colors} onChange={e => set('colors', Number(e.target.value))} /></label>
        <label>Target score<input type="number" min={0} step={50} value={level.targetScore} onChange={e => set('targetScore', Number(e.target.value))} /></label>
        <label>Objective
          <select value={level.objective} onChange={e => set('objective', e.target.value)}>
            {OBJECTIVE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="editor-actions">
        <button type="button" className="cta" onClick={test}>▶ Test play</button>
        <button type="button" className="cta secondary" onClick={save}>💾 Save level</button>
        <button type="button" className="cta secondary" onClick={() => { setLevel(blankLevel()); setMessage('New level'); }}>＋ New</button>
        {isAdmin && <button type="button" className="cta secondary" onClick={publish}>🌍 Publish (admin)</button>}
      </div>
      {message && <p role="status" className="editor-msg">{message}</p>}

      <h2>My levels</h2>
      <div className="editor-list">
        {saved.length === 0 && <p>No saved levels yet.</p>}
        {saved.map(item => (
          <div className="editor-item" key={item.id}>
            <b>{item.name}</b>
            <button type="button" onClick={() => setLevel(item)}>Edit</button>
            <Link to={`/play/custom/${item.id}`}>Play</Link>
            <button type="button" onClick={() => { deleteLocalLevel(item.id); setSaved(listLocalLevels()); }}>Delete</button>
          </div>
        ))}
      </div>

      <h2>Community levels</h2>
      <div className="editor-list">
        {community.length === 0 && <p>No published levels yet.</p>}
        {community.map(item => (
          <div className="editor-item" key={item._id}>
            <b>{item.name}</b>
            <span>{item.shots} shots</span>
            <Link to={`/play/custom/srv-${item._id}`}>Play</Link>
          </div>
        ))}
      </div>
    </main>
  );
}

/* Plays a custom level (local draft or a published server level). */
export function CustomGame({ finish }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [level, setLevel] = useState(() => (id.startsWith('srv-') ? undefined : getLocalLevel(id)));

  useEffect(() => {
    document.body.classList.add('playing');
    return () => document.body.classList.remove('playing');
  }, []);

  useEffect(() => {
    if (!id.startsWith('srv-')) return;
    let active = true;

    request('/custom-levels')
      .then(d => active && setLevel(d.levels.find(l => `srv-${l._id}` === id) || null))
      .catch(() => active && setLevel(null));

    return () => { active = false; };
  }, [id]);

  const config = useMemo(() => (level ? buildCustomConfig({ ...level, id }) : null), [level, id]);

  if (level === null) return <Navigate to="/editor" replace />;
  if (!config) return <div className="page-loading">Loading level…</div>;

  return (
    <main className="game-page">
      <GameCanvas
        key={id}
        level={0}
        config={config}
        label={`✎ ${level.name}`.slice(0, 18)}
        initialInventory={getInventory()}
        onFinish={result => finish({ ...result, level: 0, custom: true, customId: id })}
        onExit={() => nav('/editor')}
      />
    </main>
  );
}
