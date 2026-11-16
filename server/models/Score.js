import mongoose from 'mongoose';

const scoreSchema = new mongoose.Schema(
  {
    playerName: {
      type: String,
      required: true,
      trim: true,
      default: 'Player',
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    level: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { timestamps: true }
);

export const Score = mongoose.model('Score', scoreSchema);
