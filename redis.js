const Redis = require('redis');
const client = Redis.createClient();

client.connect().then(() => {
  console.log('Redis client connected');
});

module.exports = {
  get: async (key) => {
    const value = await client.get(key);
    console.log('[Redis GET]', key, '=>', value ? '[HIT]' : '[MISS]');
    return value;
  },
  set: async (key, value, ttl) => {
    await client.set(key, value, { EX: ttl || 300 }); // default to 5 min
    console.log('[Redis SET]', key, '=>', value, `(ttl: ${ttl || 300})`);
  }
}; 