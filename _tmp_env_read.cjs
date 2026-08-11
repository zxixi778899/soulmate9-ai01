const fs = require('fs');
for (const f of ['.env.local', '.env.vercel.prod']) {
  try {
    const t = fs.readFileSync(f, 'utf8');
    console.log('== ' + f);
    t.split(/\r?\n/)
      .filter((l) => /^RUNPOD_(INSTALLED_LORAS|FLUX|IPADAPTER|ENDPOINT|SDXL)/.test(l))
      .forEach((l) => {
        const i = l.indexOf('=');
        const k = l.slice(0, i);
        const v = l.slice(i + 1).replace(/^"|"$/g, '');
        console.log(k + ' => ' + (v.length > 160 ? v.slice(0, 160) + '...[' + v.length + ']' : v));
      });
  } catch (e) {
    console.log(f + ' missing');
  }
}
