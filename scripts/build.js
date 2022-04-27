var fs = require('fs-extra');

let environment = process.env.NODE_ENV || "development";
let config = JSON.parse(fs.readFileSync(`app_config.${environment}.json`, "utf8"));
let clasp_config = config.clasp_json;
let app_config = config.build_define;

fs.writeFileSync(".clasp.json", JSON.stringify(clasp_config), "utf8");

require('esbuild').build({
  entryPoints: ['src/main.ts', 'src/auth.ts', 'src/data.ts', 'src/utility.ts', 'src/Digestive.ts'],
  bundle: true,
  outdir: 'dist',
  define: app_config,
  treeShaking: false,
  platform: 'neutral',
}).catch(() => process.exit(1))