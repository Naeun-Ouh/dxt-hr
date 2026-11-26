import {defineConfig} from '@playwright/test';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import base from '../../playwright.config';
export default defineConfig({...base,testDir:'.',testMatch:'*.perf.ts',timeout:180000,outputDir:join(tmpdir(),'dxt-performance-artifacts'),reporter:'list',use:{...base.use,trace:'off'},webServer:(Array.isArray(base.webServer)?base.webServer:[]).map(server=>({...server,cwd:resolve(__dirname,'../..'),timeout:120000,env:{...server.env,DXT_PERF_HARNESS:'1'}}))});
