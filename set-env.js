const { execSync } = require('child_process');

const vars = {
    TURSO_DATABASE_URL: 'libsql://qr-attendance-awaiskhan.aws-ap-south-1.turso.io',
    TURSO_AUTH_TOKEN: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzMwMTI3NzQsImlkIjoiMDE5Y2NmYzktZWUwMS03ZGMwLTkxZmMtNzIxMzk2Y2IzMTQ2IiwicmlkIjoiMGJhZjFkNDAtZjA3OC00MjVkLWIwMmEtOTUwN2YwMTU1NmM1In0.QRlATu_wkTjXBgj0ZOW0tgbzkFs7XkrL4kNXwN5-9eu14l5vuPnIOZqcXuw9g7r-YCMDLHBHnHDbWRhiFwjyAQ',
    JWT_SECRET: 'qr-attendance-jwt-secret-2026-giki-ssd',
    QR_HMAC_SECRET: 'qr-attendance-hmac-secret-2026-giki-ssd',
    QR_WINDOW_SECONDS: '15',
};

for (const [key, value] of Object.entries(vars)) {
    try {
        execSync(`npx -y vercel@latest env rm ${key} production --yes 2>nul`, { stdio: 'ignore' });
    } catch { }
    execSync(`npx -y vercel@latest env add ${key} production`, {
        input: `${value}\n`,
        stdio: ['pipe', 'inherit', 'inherit']
    });
    console.log(`✅ Set ${key}`);
}

console.log('\nAll env vars set! Redeploying...');
execSync('npx -y vercel@latest --yes --prod', { stdio: 'inherit' });
console.log('\n🚀 Done!');
