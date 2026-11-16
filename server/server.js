import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import scoreRoutes from './routes/scoreRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const GAME_NAME = process.env.GAME_NAME || 'BUBBLE BLAST ADVENTURE';

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', game: GAME_NAME });
});

app.use('/api/scores', scoreRoutes);

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bubble_blast')
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed, starting server in fallback mode:', err.message);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
