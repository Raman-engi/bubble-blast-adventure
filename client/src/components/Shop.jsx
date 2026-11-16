import { request } from '../api';
import React, { useEffect, useState } from 'react';
import {
  ALL_ITEMS,
  ITEM_META,
  PRICES,
  buyItem,
  applyWallet,
  getCoins,
  getInventory,
} from '../game/economy';

/* Booster shop: spend coins to refill Fire, Lightning, Rainbow, Bomb and more. */
export function Shop({ onClose, focus }) {
  const [coins, setCoins] = useState(getCoins);
  const [inventory, setInventory] = useState(getInventory);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = () => {
      setCoins(getCoins());
      setInventory(getInventory());
    };

    window.addEventListener('bb-economy', refresh);
    return () => window.removeEventListener('bb-economy', refresh);
  }, []);

  const buy = async key => {
    let result;

    if (localStorage.getItem('token')) {
      // Logged in: the server checks the price and keeps the real balance.
      try {
        const data = await request('/player/wallet/buy', {
          method: 'POST',
          body: JSON.stringify({ key }),
        });
        applyWallet(data);
        result = { ok: true };
      } catch (error) {
        result = { ok: false, reason: error.message };
      }
    } else {
      result = buyItem(key);
    }

    setMessage(
      result.ok
        ? `${ITEM_META[key].icon} ${ITEM_META[key].label} added!`
        : result.reason && result.reason !== 'coins' && result.reason !== 'Not enough coins'
          ? result.reason
          : 'Not enough coins. Clear levels to earn more 🪙'
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="game-modal shop-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-eyebrow">BOOSTER SHOP</div>
        <h2>🪙 {coins}</h2>

        <div className="shop-list">
          {ALL_ITEMS.map(key => (
            <div
              className={`shop-row ${focus === key ? 'focus' : ''}`}
              key={key}
            >
              <span className="shop-icon">{ITEM_META[key].icon}</span>

              <div className="shop-info">
                <b>{ITEM_META[key].label}</b>
                <small>{ITEM_META[key].detail}</small>
              </div>

              <span className="shop-owned">×{inventory[key] || 0}</span>

              <button
                type="button"
                className="shop-buy"
                disabled={coins < PRICES[key]}
                onClick={() => buy(key)}
              >
                🪙 {PRICES[key]}
              </button>
            </div>
          ))}
        </div>

        <p className="shop-message">
          {message || 'Earn coins by clearing levels and getting stars.'}
        </p>

        <button type="button" className="modal-primary" onClick={onClose}>
          Close
        </button>
      </section>
    </div>
  );
}

export default Shop;
