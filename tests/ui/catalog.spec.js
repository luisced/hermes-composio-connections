import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
const fixtureServices=[{slug:'gmail',name:'Gmail',managed_auth:true},{slug:'zendesk',name:'Zendesk',description:'Customer support',managed_auth:true},{slug:'_1password',name:'1Password',managed_auth:false,auth_schemes:['API_KEY']}];

test('unconnected_service_is_discoverable_by_name_and_selectable',async({page})=>{
 await page.evaluate(items=>window.fixture.catalog=items,fixtureServices);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Zendesk',exact:true})).toBeVisible();
 await page.getByLabel('Buscar servicios').fill('customer support');
 await expect(page.getByRole('button',{name:'Zendesk',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Gmail',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Zendesk',exact:true}).click();
 await expect(page.getByLabel('Servicio (slug)')).toHaveValue('zendesk');
 await page.getByRole('button',{name:'Generar autorización',exact:true}).click();
 await expect(page.getByRole('button',{name:'Abrir autorización'})).toBeVisible();
 expect(await page.evaluate(()=>window.fixture.calls.find(c=>c.path==='/connect').body.toolkit)).toBe('zendesk');
});

test('catalog_selection_does_not_shrink_discovery_to_selected_slug',async({page})=>{
 await page.evaluate(items=>window.fixture.catalog=items,fixtureServices);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByRole('button',{name:'Gmail',exact:true}).click();
 await expect(page.getByRole('button',{name:'Zendesk',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'1Password',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'1Password',exact:true}).click();
 await expect(page.getByLabel('Servicio (slug)')).toHaveValue('_1password');
 await expect(page.getByRole('button',{name:'Generar autorización',exact:true})).toBeEnabled();
 await expect(page.getByRole('status').filter({hasText:/requiere configuración propia/i})).toBeVisible();
});

for(const width of [1100,420]) test('large_catalog_automatic_scroll_and_search_'+width,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.evaluate(()=>window.fixture.catalog=Array.from({length:125},(_,i)=>({slug:'service_'+i,name:'Service '+i,managed_auth:true})));
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 const grid=page.getByLabel('Catálogo de servicios', {exact:true});
 await expect(grid.getByRole('button')).toHaveCount(48);
 await expect(page.getByRole('button',{name:'Mostrar más servicios',exact:true})).toHaveCount(0);
 await grid.scrollIntoViewIfNeeded();
 await grid.evaluate(e=>e.scrollTop=e.scrollHeight);
 await expect(grid.getByRole('button')).toHaveCount(96);
 await grid.evaluate(e=>e.scrollTop=e.scrollHeight);
 await expect(grid.getByRole('button')).toHaveCount(125);
 await grid.evaluate(e=>e.scrollTop=e.scrollHeight);
 await expect(grid.getByRole('button')).toHaveCount(125);
 await page.getByLabel('Buscar servicios').fill('Service 124');
 await expect(grid.getByRole('button')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Service 124',exact:true})).toBeVisible();
 expect(await grid.evaluate(e=>e.scrollTop)).toBe(0);
 await expect(page.getByTestId('catalog-scroll-sentinel')).toHaveCount(0);
 await page.getByLabel('Buscar servicios').fill('');
 await expect(grid.getByRole('button')).toHaveCount(48);
 expect(await page.evaluate(()=>window.fixture.calls.filter(c=>c.path==='/services').length)).toBe(1);
});

test('catalog_error_is_explicit_and_does_not_present_stale_results_as_complete',async({page})=>{
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Gmail',exact:true})).toBeVisible();
 await page.evaluate(()=>window.fixture.catalogError='503: {"error":{"code":"catalog-unavailable","message":"No se pudo cargar el catálogo completo."}}');
 await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('No se pudo cargar el catálogo completo');
 await expect(page.getByLabel('Catálogo de servicios',{exact:true}).getByRole('button')).toHaveCount(0);
});

test('no_auth_catalog_services_do_not_start_pointless_oauth',async({page})=>{
 await page.evaluate(()=>window.fixture.catalog=[{slug:'public_api',name:'Public API',no_auth:true,managed_auth:false}]);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByRole('button',{name:'Public API',exact:true}).click();
 await expect(page.getByText(/no requiere autenticación/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Generar autorización',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>window.fixture.calls.filter(c=>c.path==='/connect').length)).toBe(0);
});

test('catalog_brands_beyond_original_services_have_real_bundled_icons',async({page})=>{
 await page.evaluate(()=>window.fixture.catalog=[{slug:'zendesk',name:'Zendesk'},{slug:'airtable',name:'Airtable'},{slug:'discord',name:'Discord'}]);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 for(const name of ['Zendesk','Airtable','Discord']){
  const icon=page.getByRole('img',{name:'Logo de '+name,exact:true});
  await expect(icon).toBeVisible();
  expect(await icon.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  await expect.poll(()=>icon.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
 }
 await page.setViewportSize({width:1100,height:900});
 await page.screenshot({path:'test-results/catalog-icons-wide-fixture.png',fullPage:true});
 await page.setViewportSize({width:420,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/catalog-icons-narrow-fixture.png',fullPage:true});
});

