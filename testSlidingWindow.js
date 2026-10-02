const SlidingWindow = require('./src/domain/fraud/SlidingWindow');

const window = new SlidingWindow();
const windowSeconds = 3;

console.log('=== Caso de uso 1: múltiples transacciones (debe dar ANOMALÍA) ===');
console.log('b@b.com 10:00:01 ->', window.addTransaction('b@b.com', new Date('2026-09-23T10:00:01'), windowSeconds));
console.log('b@b.com 10:00:02 ->', window.addTransaction('b@b.com', new Date('2026-09-23T10:00:02'), windowSeconds));
console.log('b@b.com 10:00:03 ->', window.addTransaction('b@b.com', new Date('2026-09-23T10:00:03'), windowSeconds));

console.log('\n=== Caso de uso 2: transacciones normales (NO debe dar anomalía) ===');
console.log('c@c.com 10:00:01 ->', window.addTransaction('c@c.com', new Date('2026-09-23T10:00:01'), windowSeconds));
console.log('c@c.com 10:00:10 ->', window.addTransaction('c@c.com', new Date('2026-09-23T10:00:10'), windowSeconds));
console.log('c@c.com 10:01:20 ->', window.addTransaction('c@c.com', new Date('2026-09-23T10:01:20'), windowSeconds));

console.log('\n=== Caso de uso 3: diferentes usuarios (ventanas NO se mezclan) ===');
console.log('u1 10:00:01 ->', window.addTransaction('usuario1@test.com', new Date('2026-09-23T10:00:01'), windowSeconds));
console.log('u2 10:00:02 ->', window.addTransaction('usuario2@test.com', new Date('2026-09-23T10:00:02'), windowSeconds));
console.log('u3 10:00:03 ->', window.addTransaction('usuario3@test.com', new Date('2026-09-23T10:00:03'), windowSeconds));