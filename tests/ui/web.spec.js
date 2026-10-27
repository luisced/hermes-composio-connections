import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/web.html');await expect(page.getByTestId('connection-row')).toHaveCount(3)});
test('web_bundle_registers_and_combines_account_and_catalog_filters',async({page})=>{
 expect(await page.evaluate(()=>window.registeredPlugin)).toBe('composio-connections');
 await page.getByLabel('Estado de conexión',{exact:true}).selectOption('EXPIRED');
 await expect(page.getByTestId('connection-row')).toHaveCount(1);
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByLabel('Disponibilidad de conexión',{exact:true}).selectOption('unconnected');
 await page.getByLabel('Autenticación',{exact:true}).selectOption('managed');
 const grid=page.getByLabel('Catálogo de servicios',{exact:true});
 await expect(grid.getByRole('button')).toHaveCount(1);
 await expect(grid.getByRole('button',{name:'Slack',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/web-filters-fixture.png'});
});
test('web_disconnect_uses_exact_confirmation_and_serialized_json',async({page})=>{
 await page.getByRole('button',{name:'Desconectar gmail_one'}).click();
 await page.getByRole('button',{name:'Confirmar desconexión'}).click();
 await expect(page.getByTestId('connection-row')).toHaveCount(2);
 const call=await page.evaluate(()=>window.fixture.calls.find(x=>x.path==='/disconnect'));
 expect(call.body).toEqual({selector:'gmail_one',confirmed:true});
 expect(call.url).toContain('/api/plugins/composio-connections/disconnect');
});
test('web_oauth_only_opens_on_user_action',async({page})=>{
 await page.getByRole('button',{name:'Conectar servicio',exact:true}).click();
 await page.getByLabel('Servicio (slug)').fill('slack');
 await page.getByRole('button',{name:'Generar autorización'}).click();
 await expect(page.getByRole('button',{name:'Abrir autorización'})).toBeVisible();
 expect(await page.evaluate(()=>window.fixture.opened)).toEqual([]);
 await page.getByRole('button',{name:'Abrir autorización'}).click();
 expect(await page.evaluate(()=>window.fixture.opened.map(x=>x.url))).toEqual(['https://connect.composio.dev/link/lk_fixture']);
});
