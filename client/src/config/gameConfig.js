
export const GAME_NAME =
  import.meta.env.VITE_GAME_NAME || 'BUBBLE BLAST ADVENTURE';

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const GAME_CONFIG = {
  title: GAME_NAME,
  apiUrl: API_URL,
  version: '1.0.0',
  maxRows: 12,
  maxCols: 9,
  bubbleRadius: 22,
  shooterSpeed: 14,

  colors: [
    {
      name: 'red',
      hex: '#EF4444',
      gradient: 'from-red-400 to-red-600'
    },
    {
      name: 'green',
      hex: '#22C55E',
      gradient: 'from-green-400 to-green-600'
    },
    {
      name: 'blue',
      hex: '#3B82F6',
      gradient: 'from-blue-400 to-blue-600'
    },
    {
      name: 'yellow',
      hex: '#EAB308',
      gradient: 'from-yellow-300 to-yellow-500'
    },
    {
      name: 'purple',
      hex: '#A855F7',
      gradient: 'from-purple-400 to-purple-600'
    }
  ]
};

export default GAME_CONFIG;
