const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { swaggerUi, swaggerSpec } = require('./swagger');

const authRoutes = require('./routes/auth.routes');
const modelRoutes = require('./routes/model.routes');
const sessionRoutes = require('./routes/session.routes');
const promptRoutes = require('./routes/prompt.routes');

const app = express();

app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/prompts', promptRoutes);

app.use(express.static(path.join(__dirname, '../public')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

module.exports = app;
