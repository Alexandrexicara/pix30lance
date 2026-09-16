const express = require('express');
const app = express();
app.use(cors({
  origin: ['https://pix30lances.onrender.com', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('/api/upload', (req, res) => {
  res.sendStatus(200);
});
app.post('/api/upload', (req, res) => {
  res.json({ success: true });
});
app.listen(3000, () => console.log('CORS test'));
