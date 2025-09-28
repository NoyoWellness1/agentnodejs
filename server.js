// start your agent first
import { runAgent } from './dist/agent.js';  // or whatever the entry point is
runAgent();

// add a minimal HTTP server so Cloud Run sees a listener
import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('ok'));
const port =  8080;
app.listen(port, '0.0.0.0', () => console.log(`Health check on ${port}`));
