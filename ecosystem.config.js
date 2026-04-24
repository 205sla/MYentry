// PM2 프로세스 정의. 진입점(src/server.js) 경로와 환경 변수의 단일 소스.
// 배포 스크립트는 pm2 startOrReload ecosystem.config.js 로 이 파일을 로드한다.

module.exports = {
    apps: [
        {
            name: 'entry',
            script: 'src/server.js',
            cwd: __dirname,
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            max_memory_restart: '512M',
            exec_mode: 'fork',
            autorestart: true,
        },
    ],
};
