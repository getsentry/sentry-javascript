const path = require('path');

const express = require('express');

const app = express();
// Wasm Integration Tests Artifacts
app.use(express.static(path.resolve(__dirname, 'public')));
// Wasm Integration Bundle
app.use(express.static(path.resolve(__dirname, '../build')));
// Browser SDK Bundle
app.use(express.static(path.resolve(__dirname, '../../browser/build')));
app.listen(process.env.PORT);
