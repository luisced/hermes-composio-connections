import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.js',workers:1,use:{baseURL:'http://127.0.0.1:5187',headless:true},webServer:{command:'npm run serve',url:'http://127.0.0.1:5187',reuseExistingServer:false}});
