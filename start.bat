@echo off
cd /d C:\Users\young\prg\ENTRY\MYentry
start http://localhost:8080
npx http-server . -p 8080 -c-1 --cors
