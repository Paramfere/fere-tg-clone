"use strict";
const WebSocket = require('ws');
require('dotenv').config();

const FERE_API_KEY = process.env.FERE_API_KEY;
const FERE_USER_ID = process.env.FERE_USER_ID;

if (!FERE_API_KEY || !FERE_USER_ID) {
  throw new Error('FERE_API_KEY and FERE_USER_ID must be set in .env');
}

/**
 * Sends a message to the Fere Pro agent and returns the full response object.
 * @param {string} userMessage - The message to send to Fere Pro.
 * @returns {Promise<object>} - The full response object from Fere Pro.
 */
async function askFerePro(userMessage) {
  return new Promise((resolve, reject) => {
    const url = `wss://api.fereai.xyz/f/chat/v2/ws/${FERE_USER_ID}?X-FRIDAY-KEY=${FERE_API_KEY}`;
    const ws = new WebSocket(url);
    let answer = '';
    let fullResponse = {};
    let resolved = false;

    ws.on('open', () => {
      const message = {
        message: userMessage,
        stream: true,
        agent: 'ProAgent',
      };
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.answer) {
          answer += parsed.answer;
        }
        // Merge all fields from the latest message
        fullResponse = { ...fullResponse, ...parsed };
        // If the response contains a 'final' flag or the connection closes, resolve
        if (parsed.final || parsed.done) {
          resolved = true;
          ws.close();
          fullResponse.answer = answer.trim() || '[No answer received]';
          resolve(fullResponse);
        }
      } catch (err) {
        // If not JSON, just append as text
        answer += data.toString();
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        fullResponse.answer = answer.trim() || '[No answer received]';
        resolve(fullResponse);
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

module.exports = { askFerePro }; 