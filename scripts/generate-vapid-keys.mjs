import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('Füge diese Werte als Umgebungsvariablen in Vercel ein:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:deine@mail.de');
