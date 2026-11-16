import express from 'express';
import { Score } from '../models/Score.js';

const router = express.Router();

// GET Top 10 Leaderboard Scores
router.get('/', async (req, res) => {
  try {
    const topScores = await Score.find().sort({ score: -1 }).limit(10);
    res.json({ success: true, data: topScores });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST Save Validated Game Score
router.post('/', async (req, res) => {
  try {
    const { playerName, score, level } = req.body;

    if (typeof score !== 'number' || score < 0 || score > 1000000) {
      return res.status(400).json({ success: false, message: 'Invalid score value' });
    }

    const saved = await Score.create({
      playerName: playerName || 'Player',
      score,
      level: level || 1,
    });

    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
