import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",
  workers:1,
  timeout:20000,
  use:{
    baseURL:"http://127.0.0.1:4173",
    browserName:"chromium",
    viewport:{width:600,height:850},
    deviceScaleFactor:2,
    isMobile:true,
    hasTouch:true,
    headless:true
  },
  webServer:{
    command:"python3 -m http.server 4173 --bind 127.0.0.1",
    url:"http://127.0.0.1:4173",
    reuseExistingServer:!process.env.CI,
    timeout:20000
  }
});
