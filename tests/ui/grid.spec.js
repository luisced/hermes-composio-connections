import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const shipped=JSON.parse(readFileSync(new URL('../../desktop/plugin.js',import.meta.url),'utf8').match(/const SERVICES = ([\s\S]*?);\nconst ID/)[1]);
const logoSlugs=JSON.parse(readFileSync(new URL('../../assets/service-logos.json',import.meta.url),'utf8')).logos.map(l=>l.slug);

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
test('cards_form_a_grid_and_collapse_without_overflow',async({page})=>{
 await page.setViewportSize({width:1100,height:850});
 const cards=page.getByTestId('connection-row');
 const a=await cards.nth(0).boundingBox(),b=await cards.nth(1).boundingBox();
 expect(Math.abs(a.y-b.y)).toBeLessThan(2); expect(b.x).toBeGreaterThan(a.x+a.width/2);
 await page.setViewportSize({width:420,height:850});
 const c=await cards.nth(0).boundingBox(),d=await cards.nth(1).boundingBox();
 expect(Math.abs(c.x-d.x)).toBeLessThan(2);expect(d.y).toBeGreaterThan(c.y);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('bundled_service_logos_load_without_external_image_requests',async({page})=>{
 const logos=page.getByRole('img',{name:'Logo de Gmail',exact:true});
 await expect(logos).toHaveCount(3);
 await expect.poll(()=>logos.first().evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
 expect(await logos.first().getAttribute('src')).toMatch(/^data:image\/(svg\+xml|png);base64,/);
});
test('readable_service_names_are_searchable_and_shown_in_chooser',async({page})=>{
 await page.evaluate(()=>window.fixture.rows=[{key:'googledrive:drive_one',toolkit:'googledrive',alias:'trabajo',status:'ACTIVE',selector:'drive_one',removable:true}]);
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByTestId('connection-row').getByText('Google Drive',{exact:true})).toBeVisible();
 await page.getByLabel('Buscar conexiones').fill('Google Drive');await expect(page.getByTestId('connection-row')).toHaveCount(1);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Gmail',exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:'Logo de Gmail',exact:true})).toBeVisible();
});
test('unknown_or_failed_logo_preserves_identity_and_actions',async({page})=>{
 await page.getByRole('img',{name:'Logo de Gmail',exact:true}).first().evaluate(e=>e.dispatchEvent(new Event('error')));
 await expect(page.getByRole('img',{name:'Icono de Gmail',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Desconectar gmail_one'})).toBeEnabled();
 await page.evaluate(()=>window.fixture.rows.push({key:'unknown:one',toolkit:'private_crm',alias:'custom',status:'ACTIVE',selector:'unknown_one',removable:true}));
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByRole('img',{name:'Icono de Private Crm',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Desconectar unknown_one'})).toBeEnabled();
});

test('every_bundled_brand_loads_offline',async({page})=>{
 const sample=['gmail','github','notion','slack','spotify','googleslides','googledrive','googlesheets','neon','google_maps','linear','googledocs','googlecalendar'];
 await page.evaluate(slugs=>window.fixture.rows=slugs.map((toolkit,i)=>({key:`fixture:${i}`,toolkit,alias:'Cuenta de prueba',status:'ACTIVE',selector:`fixture_${i}`,removable:true})),sample);
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 const images=page.locator('article img');await expect(images).toHaveCount(sample.length);
 await page.context().setOffline(true);
 const allArtwork=logoSlugs.map(slug=>shipped[slug].logo);
 expect(await page.evaluate(async icons=>{
  let decoded=0;
  for(let offset=0;offset<icons.length;offset+=64){
   const batch=await Promise.all(icons.slice(offset,offset+64).map(async source=>{const image=new Image();image.src=source;await image.decode();return image.naturalWidth>0}));
   decoded+=batch.filter(Boolean).length;
  }
  return decoded;
 },allArtwork)).toBe(allArtwork.length);
 await expect.poll(()=>images.evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 await page.setViewportSize({width:1100,height:900});
 await page.addStyleTag({content:':root{--ui-text-secondary:#98a4b5;--ui-stroke-secondary:#384252;color:#e6edf3;background:#151b25;font-family:system-ui}button,input{font:inherit}'});
 await page.screenshot({path:'test-results/brands-dark-fixture.png',fullPage:true});
});

