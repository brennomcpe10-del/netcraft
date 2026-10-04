import express from 'express';
import { apiRouter } from '../server/routes/api.ts';

const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

app.use((req, _res, next) => {
  if (req.url === '/api') {
    req.url = '/';
  } else if (req.url.startsWith('/api/')) {
    req.url = req.url.substring(4);
  }
  next();
});

app.use('/', apiRouter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'NetCraftBR API',
    timestamp: new Date().toISOString()
  });
});

export default app;
