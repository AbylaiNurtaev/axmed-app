// Local-only visual fixture. Never imported by App.tsx and never contacts the API.
const { build } = require("../server/node_modules/esbuild");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const source = readFileSync(resolve("src/features/auth/ui.tsx"), "utf8");
const colors = source.match(/export const authColors = ([\s\S]*?) as const;/)[1];
const uiPath = resolve("src/features/devices/DeviceReadingsPanel.tsx").replaceAll("\\", "/");
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DeviceReadingsPanel } from ${JSON.stringify(uiPath)};
const sample = (metric, value, unit, suffix='fixture') => ({sourceRecordId:metric+':'+suffix,metric,value,unit,recordedAt:'2026-09-11T16:24:00Z',localDate:'2026-09-11'});
const batch = {
 device:{id:'visual-fixture',name:'G72 fixture',kind:'fitness-band',adapterId:'hband'},
 readAt:'2026-09-11T17:00:00Z',timeZone:'Asia/Almaty',historyDays:7,skippedRecords:0,syncVersion:2,
 samples:[sample('steps',3520,'count'),sample('distance',3.06,'km'),sample('activeCalories',256.4,'kcal'),
 {...sample('heartRate',82,'bpm'),origin:'manual',aggregation:'mean'},sample('oxygenSaturation',96,'percent'),
 sample('bodyTemperature',36.2,'celsius'),sample('hrv',40,'ms'),sample('stress',36,'score'),sample('met',0.9,'MET'),
 sample('bloodPressureSystolic',123,'mmHg'),sample('bloodPressureDiastolic',88,'mmHg'),
 ...[['sleepDuration',553],['sleepDeep',90],['sleepLight',400],['sleepRem',63],['sleepAwake',0]].map(([m,v])=>({...sample(m,v,'min'),recordedAt:'2026-09-10T20:51:00Z',periodEnd:'2026-09-11T06:04:00Z'})),
 {...sample('steps',1200,'count','yesterday'),recordedAt:'2026-09-10T16:00:00Z',localDate:'2026-09-10'}]
};
function Preview(){const [empty,setEmpty]=useState(false);const [small,setSmall]=useState(false);return <main style={{maxWidth:small?320:390,margin:'auto',padding:18,boxSizing:'border-box'}}>
<p>Тест интерфейса · не данные подключения</p><button onClick={()=>setEmpty(v=>!v)}>{empty?'Заполнить':'Нет данных'}</button><button onClick={()=>setSmall(v=>!v)}>{small?'390 px':'320 px'}</button>
<DeviceReadingsPanel key={empty?'empty':'full'} batch={empty?{...batch,samples:[]}:batch}/></main>}
createRoot(document.getElementById('root')).render(<Preview/>);`;

(async () => {
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", alias: { "react-native": "react-native-web" },
    define: { "process.env.NODE_ENV": '"development"', __DEV__: "true" },
    plugins: [{ name: "theme-only", setup(api) {
      api.onResolve({ filter: /auth\/ui$/ }, () => ({ path: "colors", namespace: "theme" }));
      api.onLoad({ filter: /.*/, namespace: "theme" }, () => ({ contents: `export const authColors = ${colors};`, loader: "js" }));
    } }]
  });
  const js = bundle.outputFiles[0].text;
  createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.url === "/bundle.js") {res.setHeader("Content-Type", "application/javascript");res.end(js);}
    else {res.setHeader("Content-Type", "text/html; charset=utf-8");res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>AxMed readings fixture</title><style>body{margin:0;font-family:Arial;background:#fff}button{min-height:40px;margin:0 8px 20px 0}</style><div id="root"></div><script src="/bundle.js"></script>');}
  }).listen(8083, "127.0.0.1", () => console.log("UI fixture: http://127.0.0.1:8083"));
})().catch(error => { console.error(error); process.exitCode = 1; });
