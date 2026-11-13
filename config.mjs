export const IS_PREVIEW = /\/dev(?:\/|$)/.test(location.pathname) || new URLSearchParams(location.search).get("preview")==="1";
export const FLAGS = Object.freeze({
  monthlyEvents: true
});
export const SAVE_KEY = IS_PREVIEW ? "willow-valley:dev:v1" : "willow-valley:main:v1";
